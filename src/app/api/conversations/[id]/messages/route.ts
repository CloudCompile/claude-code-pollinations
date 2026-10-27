
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin, truncateToolOutput } from "@/lib/supabase";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  // verify ownership
  const { data: conv } = await sb
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("pollinations_sub", session.sub)
    .single();
  if (!conv) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await req.json();
  let content = body?.content;
  if (typeof content === "string") {
    content = truncateToolOutput(content);
  }
  const { data, error } = await sb
    .from("messages")
    .insert({
      conversation_id: id,
      role: body?.role,
      model: body?.model ?? null,
      content,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // bump updated_at
  await sb.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ message: data }, { status: 201 });
}