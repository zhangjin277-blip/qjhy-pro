import { NextRequest, NextResponse } from "next/server";
import { getCheckinState } from "@/modules/checkin/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ live_account_id: string }> },
): Promise<NextResponse> {
  const { live_account_id } = await params;
  const state = await getCheckinState(live_account_id);
  if (!state) return NextResponse.json({ error: "ACCOUNT_NOT_FOUND" }, { status: 404 });
  return NextResponse.json(state);
}
