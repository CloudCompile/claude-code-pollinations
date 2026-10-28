import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { connectUserSandbox, ownsSandbox } from "@/lib/sandbox-connect";

export const maxDuration = 60;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file

// Detect archive type from magic bytes.
function archiveType(buf: Buffer): "zip" | "tar" | "gzip" | "plain" {
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b) return "zip";
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) return "gzip";
  if (buf.length >= 262 && buf.toString("ascii", 257, 262) === "ustar") return "tar";
  return "plain";
}

function sanitizeSkillName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, "-")
      .replace(/^-|-$/g, "") || "skill"
  );
}

// Extract a .skill archive (zip / tar.gz / tar) into dest using python3,
// which is more tolerant than unzip across variants.
async function extractSkill(
  sbx: Awaited<ReturnType<typeof connectUserSandbox>>,
  tmp: string,
  dest: string,
) {
  const mk = await sbx.commands.run(`mkdir -p ${JSON.stringify(dest)}`, {
    timeoutMs: 15_000,
  });
  if (mk.exitCode !== 0) return { ok: false, err: mk.stderr || "mkdir failed" };
  const script = `
import shutil, sys, tarfile, zipfile, os
src = sys.argv[1]; dst = sys.argv[2]; os.makedirs(dst, exist_ok=True)
if zipfile.is_zipfile(src):
    with zipfile.ZipFile(src) as z: z.extractall(dst)
else:
    with tarfile.open(src) as t: t.extractall(dst)
print("ok")
`;
  const py = await sbx.commands.run(
    `python3 -c ${JSON.stringify(script)} ${JSON.stringify(tmp)} ${JSON.stringify(dest)}`,
    { timeoutMs: 30_000 },
  );
  return { ok: py.exitCode === 0, err: py.exitCode !== 0 ? py.stderr || py.stdout || "extract failed" : undefined };
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
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "files_required" }, { status: 400 });
  const target = (form.get("target") as string) || "/home/user";

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
        errors.push(`${file.name}: exceeds 10 MB`);
        continue;
      }
      const buf = Buffer.from(await file.arrayBuffer());
      // Exact-size copy: `.buffer` may back a slab/pool; pass a precise ArrayBuffer.
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      const name = file.name;

      if (name.endsWith(".skill") || /\.(tar|tgz|tar\.gz)$/.test(name)) {
        // skill bundle: zip / tar / tar.gz containing SKILL.md
        const stem = sanitizeSkillName(name.replace(/\.(skill|tgz|tar\.gz|tar)$/, ""));
        const dest = `/home/user/.claude/skills/${stem}`;
        const tmp = `/tmp/upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        try {
          const type = archiveType(buf);
          if (type === "plain") {
            errors.push(`${name}: not an archive (.skill should be zip/tar.gz)`);
            continue;
          }
          await sbx.files.write(tmp, ab);
          const res = await extractSkill(sbx, tmp, dest);
          await sbx.commands.run(`rm -f ${JSON.stringify(tmp)}`, { timeoutMs: 10_000 }).catch(() => undefined);
          if (!res.ok) {
            errors.push(`${name}: ${res.err}`);
            continue;
          }
          // verify SKILL.md exists
          const ls = await sbx.commands.run(`ls ${JSON.stringify(dest)}/SKILL.md 2>/dev/null`, {
            timeoutMs: 15_000,
          });
          if (ls.exitCode !== 0) {
            // maybe nested in a subdirectory; find it
            const find = await sbx.commands.run(
              `find ${JSON.stringify(dest)} -name SKILL.md | head -1`,
              { timeoutMs: 15_000 },
            );
            const found = String(find.stdout).trim();
            if (found) {
              const parent = found.replace(/\/SKILL\.md$/, "");
              await sbx.commands.run(`mkdir -p ${JSON.stringify(dest)} && mv ${JSON.stringify(found)} ${JSON.stringify(dest)}/SKILL.md`, {
                timeoutMs: 15_000,
              });
            }
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
          await sbx.commands.run(
            `mkdir -p ${JSON.stringify(`/home/user/.claude/skills/${skillName}`)}`,
            { timeoutMs: 15_000 },
          );
          await sbx.files.write(dest, ab);
          skills.push(skillName);
          written.push(dest);
        } catch (e) {
          errors.push(`${name}: ${e instanceof Error ? e.message : "write failed"}`);
        }
      } else {
        // regular file — write to target dir
        const dest = `${target.replace(/\/$/, "")}/${name}`;
        try {
          await sbx.files.write(dest, ab);
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