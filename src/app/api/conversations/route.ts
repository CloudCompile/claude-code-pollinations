
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("conversations")
    .select("*")
    .eq("pollinations_sub", session.sub)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ conversations: data });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("conversations")
    .insert({
      pollinations_sub: session.sub,
      sandbox_id: body?.sandbox_id ?? null,
      model: body?.model ?? null,
      title: body?.title ?? null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ conversation: data }, { status: 201 });
}