
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getTextModels } from "@/lib/models";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const models = await getTextModels();
    return NextResponse.json({ models });
  } catch (e: unknown) {
    return NextResponse.json({ error: "models_error", message: e?.message }, { status: 500 });
  }
}