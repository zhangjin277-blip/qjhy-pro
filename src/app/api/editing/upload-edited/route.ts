import { NextRequest, NextResponse } from "next/server";
import { uploadEdited } from "@/modules/editing-task";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData();
    await uploadEdited(fd);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
