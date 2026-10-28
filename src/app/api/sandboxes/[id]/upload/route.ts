import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { connectUserSandbox, ownsSandbox } from "@/lib/sandbox-connect";

export const maxDuration = 60;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file

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
  try {
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: "file_too_large", message: `${file.name} exceeds 10 MB` },
          { status: 413 },
        );
      }
      const buf = Buffer.from(await file.arrayBuffer());

      if (file.name.endsWith(".skill")) {
        // .skill = zip bundle containing SKILL.md; extract into ~/.claude/skills/<stem>/
        const stem = file.name.replace(/\.skill$/, "");
        const dest = `/home/user/.claude/skills/${stem}`;
        await sbx.commands.run(`mkdir -p ${JSON.stringify(dest)}`, { timeoutMs: 15_000 });
        const tmp = `/tmp/${JSON.stringify(file.name)}`;
        await sbx.files.write(tmp, buf.buffer as ArrayBuffer);
        const unzip = await sbx.commands.run(
          `cd ${JSON.stringify(dest)} && unzip -o ${tmp} && rm -f ${tmp}`,
          { timeoutMs: 30_000 },
        );
        if (unzip.exitCode !== 0) {
          return NextResponse.json(
            { error: "skill_extract_failed", message: unzip.stderr || "unzip failed" },
            { status: 400 },
          );
        }
        skills.push(stem);
        written.push(`${dest}/`);
      } else if (/^SKILL\.md$/i.test(file.name)) {
        // bare SKILL.md -> its own skill dir named after the title or 'skill'
        const text = buf.toString("utf8");
        const titleMatch = text.match(/^#\s+(.+)$/m);
        const name =
          (titleMatch?.[1] ?? "skill")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || "skill";
        const dest = `/home/user/.claude/skills/${name}/SKILL.md`;
        await sbx.commands.run(`mkdir -p ${JSON.stringify(`/home/user/.claude/skills/${name}`)}`, {
          timeoutMs: 15_000,
        });
        await sbx.files.write(dest, buf.buffer as ArrayBuffer);
        skills.push(name);
        written.push(dest);
      } else {
        // regular file
        const dest = `${target.replace(/\/$/, "")}/${file.name}`;
        await sbx.files.write(dest, buf.buffer as ArrayBuffer);
        written.push(dest);
      }
    }
    return NextResponse.json({ written, skills }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "upload failed";
    return NextResponse.json({ error: "upload_failed", message: msg }, { status: 500 });
  }
}