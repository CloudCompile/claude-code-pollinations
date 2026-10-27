
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: conv, error } = await sb
    .from("conversations")
    .select("*")
    .eq("id", id)
    .eq("pollinations_sub", session.sub)
    .single();
  if (error || !conv) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { data: msgs } = await sb
    .from("messages")
    .select("*")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });
  return NextResponse.json({ conversation: conv, messages: msgs ?? [] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("conversations")
    .delete()
    .eq("id", id)
    .eq("pollinations_sub", session.sub);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const sb = supabaseAdmin();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body?.title !== undefined) update.title = body.title;
  if (body?.model !== undefined) update.model = body.model;
  if (body?.sandbox_id !== undefined) update.sandbox_id = body.sandbox_id;
  const { data, error } = await sb
    .from("conversations")
    .update(update)
    .eq("id", id)
    .eq("pollinations_sub", session.sub)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ conversation: data });
}