import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-guard";

interface JobRow extends Record<string, unknown> {
  id: string;
  name: string;
  state: string;
  date: string | null;
  attempt: number | null;
  created_on: string;
  started_on: string | null;
  completed_on: string | null;
  dur_s: number | null;
  err: string | null;
}

export async function GET(): Promise<NextResponse> {
  await requireAdmin();

  // 直接 SQL 读 pgboss.job — 比 boss.getQueueSize 信息丰富，且避开 server barrel 的 puppeteer 链
  const jobs = (await db.execute<JobRow>(sql`
    SELECT
      id::text AS id,
      name,
      state,
      data->>'date' AS date,
      (data->>'attempt')::int AS attempt,
      created_on::text AS created_on,
      started_on::text AS started_on,
      completed_on::text AS completed_on,
      EXTRACT(EPOCH FROM (completed_on - started_on))::int AS dur_s,
      output->>'error' AS err
    FROM pgboss.job
    WHERE name LIKE 'crawler:%'
      AND created_on > now() - interval '24 hours'
    ORDER BY created_on DESC
    LIMIT 50
  `)) as unknown as JobRow[];

  // 状态汇总
  const summary: Record<string, number> = {};
  for (const j of jobs) {
    summary[j.state] = (summary[j.state] ?? 0) + 1;
  }

  return NextResponse.json({ jobs, summary });
}
