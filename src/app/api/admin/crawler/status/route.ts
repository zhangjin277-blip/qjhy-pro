import { NextResponse } from "next/server";
import { getBoss, JOB_NAMES } from "@/modules/crawler/server";
import { requireAdmin } from "@/lib/admin-guard";

export async function GET(): Promise<NextResponse> {
  await requireAdmin();
  const boss = await getBoss();
  const stats: Record<string, { created: number }> = {};
  for (const name of Object.values(JOB_NAMES)) {
    try {
      const count = await boss.getQueueSize(name as string);
      stats[name as string] = { created: count ?? 0 };
    } catch {
      // Queue may not exist yet if no jobs have been sent to it
      stats[name as string] = { created: 0 };
    }
  }
  return NextResponse.json({ stats });
}
