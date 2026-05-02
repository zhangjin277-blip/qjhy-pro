import { NextResponse } from "next/server";
import { listBrokerMappings } from "@/modules/brokers/server";
import { requireAdmin } from "@/lib/admin-guard";

export async function GET(): Promise<NextResponse> {
  await requireAdmin();
  const rows = await listBrokerMappings();
  return NextResponse.json({ brokers: rows });
}
