import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { connectUserSandbox, ownsSandbox } from "@/lib/sandbox-connect";

export const maxDuration = 60;
// Pin to Node runtime so Buffer/Blob/multipart behavior is consistent.
export const runtime = "nodejs";

// Vercel's serverless functions cap request bodies around 4.5 MB. Keep the
// total upload (all files in one multipart body) safely under that.
const MAX_TOTAL_BYTES = 4 * 1024 * 1024; // 4 MB total across all files in one request
const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4 MB per file

function sanitizeSkillName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, "-")
      .replace(/^-|-$/g, "") || "skill"
  );
}

// The SDK **throws** CommandExitError on non-zero exit; wrap all command runs so
// callers can inspect status/output instead of crashing.
async function runChecked(
  sbx: Awaited<ReturnType<typeof connectUserSandbox>>,
  cmd: string,
  timeoutMs = 20_000,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const r = await sbx.commands.run(cmd, { timeoutMs });
    return { exitCode: r.exitCode, stdout: String(r.stdout ?? ""), stderr: String(r.stderr ?? "") };
  } catch (e) {
    const err = e as { result?: { exitCode?: number; stdout?: string; stderr?: string }; message?: string };
    return {
      exitCode: err?.result?.exitCode ?? 1,
      stdout: String(err?.result?.stdout ?? ""),
      stderr: String(err?.result?.stderr ?? err?.message ?? ""),
    };
  }
}

// Extract a .skill archive (zip / tar.gz / tar) into dest using python3.
// The script is written to a file first (the SDK's files.write) and then run —
// inline `-c` strings get mangled by shell quoting.
async function extractSkill(
  sbx: Awaited<ReturnType<typeof connectUserSandbox>>,
  tmp: string,
  dest: string,
) {
  const mk = await runChecked(sbx, `mkdir -p ${JSON.stringify(dest)}`, 15_000);
  if (mk.exitCode !== 0) return { ok: false, err: mk.stderr || "mkdir failed" };

  const scriptPath = `/tmp/extract-${Date.now()}-${Math.random().toString(36).slice(2)}.py`;
  const script =
    "import sys, os, zipfile, tarfile\n" +
    "src, dst = sys.argv[1], sys.argv[2]\n" +
    "os.makedirs(dst, exist_ok=True)\n" +
    "if zipfile.is_zipfile(src):\n" +
    "    zipfile.ZipFile(src).extractall(dst)\n" +
    "else:\n" +
    "    tarfile.open(src).extractall(dst)\n" +
    "print('ok')\n";
  try {
    // Blob over a fresh copy preserves exact bytes (verified end-to-end).
    await sbx.files.write(scriptPath, new Blob([script]));
  } catch (e) {
    console.error("[upload] extractor write failed", e);
    return { ok: false, err: `could not write extractor: ${e instanceof Error ? e.message : String(e)}` };
  }
  const py = await runChecked(
    sbx,
    `python3 ${JSON.stringify(scriptPath)} ${JSON.stringify(tmp)} ${JSON.stringify(dest)}`,
    30_000,
  );
  await runChecked(sbx, `rm -f ${JSON.stringify(scriptPath)}`, 10_000).catch(() => undefined);
  if (py.exitCode !== 0) {
    return { ok: false, err: (py.stderr || py.stdout || "extract failed").trim().slice(0, 300) };
  }
  return { ok: true };
}

// Ensure a SKILL.md exists directly under dest even when the archive nests a
// folder (e.g. music-visualizer/SKILL.md). Returns the final path or null.
async function ensureSkillMarkdown(
  sbx: Awaited<ReturnType<typeof connectUserSandbox>>,
  dest: string,
): Promise<string | null> {
  const direct = await runChecked(sbx, `ls ${JSON.stringify(dest)}/SKILL.md 2>/dev/null`, 15_000);
  if (direct.exitCode === 0 && direct.stdout.trim()) return `${dest}/SKILL.md`;
  const find = await runChecked(sbx, `find ${JSON.stringify(dest)} -name SKILL.md | head -1`, 15_000);
  const found = find.stdout.trim().split("\n")[0] ?? "";
  if (!found) return null;
  const mv = await runChecked(
    sbx,
    `mkdir -p ${JSON.stringify(dest)} && mv ${JSON.stringify(found)} ${JSON.stringify(dest)}/SKILL.md`,
    15_000,
  );
  return mv.exitCode === 0 ? `${dest}/SKILL.md` : null;
}

// POST /api/sandboxes/[id]/upload  (multipart form: files[], target dir)
// Writes files into the sandbox. Accepts regular files, .skill bundles
// (zip -> extracted to ~/.claude/skills/<name>/), and SKILL.md files
// (placed in ~/.claude/skills/<stem>/SKILL.md).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  try {
    if (!(await ownsSandbox(session.sk, session.sub, id))) {
      return NextResponse.json({ error: "not_found", message: "Sandbox not found." }, { status: 404 });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "ownership check failed";
    const stale = msg.includes("Sign out");
    return NextResponse.json(
      { error: stale ? "stale_session" : "sandbox_error", message: msg },
      { status: stale ? 403 : 500 },
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "form_required" }, { status: 400 });
  // Robust file detection: instanceof File can fail across runtimes; check for
  // the multipart File shape instead.
  const isFile = (v: FormDataEntryValue): v is File =>
    typeof v === "object" && v !== null && typeof (v as File).arrayBuffer === "function";

  const target = (form.get("target") as string) || "/home/user";

  // --- Chunked mode (for files > ~3MB to stay under Vercel's body cap) ---
  const chunkIndexRaw = form.get("chunkIndex");
  if (chunkIndexRaw !== null) {
    const name = (form.get("name") as string) || "file";
    const chunkIndex = Number(chunkIndexRaw);
    const totalChunks = Number(form.get("totalChunks") ?? "1");
    const isChunkFinal = chunkIndex >= totalChunks - 1;
    const chunkFile = form.get("data");
    if (!chunkFile || !isFile(chunkFile)) {
      return NextResponse.json({ error: "files_required", message: "No chunk data received." }, { status: 400 });
    }

    const sbx = await connectUserSandbox(session.sk, id, 60_000).catch((e: unknown) => {
      const err = e as { statusCode?: number; message?: string };
      throw new Error(err?.message ?? "connect failed");
    });

    const staged = `/tmp/up-${session.sub.slice(0, 8)}-${Buffer.from(name).toString("hex").slice(0, 24)}`;
    const chunkBuf = Buffer.from(await chunkFile.arrayBuffer());

    // Start fresh on the first chunk.
    if (chunkIndex === 0) {
      await runChecked(sbx, `rm -f ${JSON.stringify(staged)}`, 10_000);
    }
    // Append this chunk via `cat >>` with stdin.
    try {
      const handle = await sbx.commands.run(`cat >> ${JSON.stringify(staged)}`, {
        background: true,
        stdin: true,
        timeoutMs: 60_000,
      });
      await handle.sendStdin(new Uint8Array(chunkBuf));
      await handle.closeStdin();
      await handle.wait();
    } catch (e) {
      return NextResponse.json(
        { error: "chunk_write_failed", message: e instanceof Error ? e.message : "append failed" },
        { status: 500 },
      );
    }

    if (!isChunkFinal) {
      return NextResponse.json({ ok: true, received: chunkIndex, total: totalChunks });
    }

    // Final chunk: process the fully reassembled staged file.
    if (name.endsWith(".skill") || /\.(tar|tgz|tar\.gz)$/.test(name)) {
      const stem = sanitizeSkillName(name.replace(/\.(skill|tgz|tar\.gz|tar)$/, ""));
      const dest = `/home/user/.claude/skills/${stem}`;
      const res = await extractSkill(sbx, staged, dest);
      await runChecked(sbx, `rm -f ${JSON.stringify(staged)}`, 10_000);
      if (!res.ok) {
        return NextResponse.json({ error: "skill_extract_failed", message: res.err }, { status: 400 });
      }
      const finalMarkdown = await ensureSkillMarkdown(sbx, dest);
      if (!finalMarkdown) {
        return NextResponse.json({ error: "skill_extract_failed", message: "no SKILL.md found" }, { status: 400 });
      }
      return NextResponse.json({ written: [dest], skills: [stem], errors: [] }, { status: 201 });
    }

    if (/^SKILL\.md$/i.test(name)) {
      const text = chunkBuf.toString("utf8");
      const titleMatch = text.match(/^#\s+(.+)$/m);
      const skillName = sanitizeSkillName(titleMatch?.[1] ?? "skill");
      const dest = `/home/user/.claude/skills/${skillName}/SKILL.md`;
      await runChecked(sbx, `mkdir -p ${JSON.stringify(`/home/user/.claude/skills/${skillName}`)}`, 15_000);
      await sbx.files.write(dest, new Blob([chunkBuf]));
      await runChecked(sbx, `rm -f ${JSON.stringify(staged)}`, 10_000);
      return NextResponse.json({ written: [dest], skills: [skillName], errors: [] }, { status: 201 });
    }

    // Regular file: move staged -> target.
    const dest = `${target.replace(/\/$/, "")}/${name}`;
    await runChecked(sbx, `mkdir -p ${JSON.stringify(target)}`, 15_000);
    const mv = await runChecked(sbx, `mv ${JSON.stringify(staged)} ${JSON.stringify(dest)}`, 15_000);
    if (mv.exitCode !== 0) {
      return NextResponse.json({ error: "write_failed", message: mv.stderr || "move failed" }, { status: 500 });
    }
    return NextResponse.json({ written: [dest], skills: [], errors: [] }, { status: 201 });
  }

  // --- Single-shot mode (small files) ---
  const files = form.getAll("files").filter(isFile);
  if (files.length === 0) return NextResponse.json({ error: "files_required", message: "No files received." }, { status: 400 });

  // Enforce the total-body budget up front (avoids Vercel's 413 and gives a
  // clear client-readable error instead of a plain-text "Request Entity Too Large").
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      {
        error: "upload_too_large",
        message: `Total upload size ${(totalBytes / 1024 / 1024).toFixed(1)} MB exceeds the 4 MB limit. Use larger files via chunked upload.`,
      },
      { status: 413 },
    );
  }

  let sbx;
  try {
    sbx = await connectUserSandbox(session.sk, id, 60_000);
  } catch (e: unknown) {
    const err = e as { statusCode?: number; message?: string };
    return NextResponse.json(
      { error: "sandbox_error", message: err?.message ?? "connect failed" },
      { status: err?.statusCode ?? 500 },
    );
  }

  const written: string[] = [];
  const skills: string[] = [];
  const errors: string[] = [];
  try {
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        errors.push(`${file.name}: exceeds 4 MB`);
        continue;
      }
      const buf = Buffer.from(await file.arrayBuffer());
      // Blob over the exact bytes — byte-exact and type-checked for the SDK.
      const data = new Blob([buf]);
      const name = file.name;

      if (name.endsWith(".skill") || /\.(tar|tgz|tar\.gz)$/.test(name)) {
        const stem = sanitizeSkillName(name.replace(/\.(skill|tgz|tar\.gz|tar)$/, ""));
        const dest = `/home/user/.claude/skills/${stem}`;
        const tmp = `/tmp/upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        try {
          await sbx.files.write(tmp, data);
          const res = await extractSkill(sbx, tmp, dest);
          await runChecked(sbx, `rm -f ${JSON.stringify(tmp)}`, 10_000);
          if (!res.ok) {
            errors.push(`${name}: ${res.err}`);
            continue;
          }
          const finalMarkdown = await ensureSkillMarkdown(sbx, dest);
          if (!finalMarkdown) {
            errors.push(`${name}: extracted but no SKILL.md found inside`);
            continue;
          }
          skills.push(stem);
          written.push(`${dest}/`);
        } catch (e) {
          errors.push(`${name}: ${e instanceof Error ? e.message : "extract failed"}`);
        }
      } else if (/^SKILL\.md$/i.test(name)) {
        const text = buf.toString("utf8");
        const titleMatch = text.match(/^#\s+(.+)$/m);
        const skillName = sanitizeSkillName(titleMatch?.[1] ?? "skill");
        const dest = `/home/user/.claude/skills/${skillName}/SKILL.md`;
        try {
          await runChecked(
            sbx,
            `mkdir -p ${JSON.stringify(`/home/user/.claude/skills/${skillName}`)}`,
            15_000,
          );
          await sbx.files.write(dest, data);
          skills.push(skillName);
          written.push(dest);
        } catch (e) {
          errors.push(`${name}: ${e instanceof Error ? e.message : "write failed"}`);
        }
      } else {
        const dest = `${target.replace(/\/$/, "")}/${name}`;
        try {
          await sbx.files.write(dest, data);
          written.push(dest);
        } catch (e) {
          errors.push(`${name}: ${e instanceof Error ? e.message : "write failed"}`);
        }
      }
    }
    return NextResponse.json({ written, skills, errors }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "upload failed";
    return NextResponse.json({ error: "upload_failed", message: msg }, { status: 500 });
  }
}