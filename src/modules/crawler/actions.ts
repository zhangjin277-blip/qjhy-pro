"use server";

import { db } from "@/db/client";
import { field_alias } from "@/db/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { writeAuditLog } from "@/lib/audit";
import { z } from "zod";
// 直接从子模块导入，避免走 ./server barrel —— barrel 会 re-export 所有 adapter，
// 进而 transitive 拉到 puppeteer-extra-plugin-stealth，里面有 lazy-cache，Turbopack 会报
// "utils.typeOf is not a function"。server actions 只需要 queue + cookie，不需要 puppeteer。
import { enqueue, JOB_NAMES } from "./queue";
import { saveCookies, type Basecamp } from "./cookie";

const RerunInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  basecamp: z.enum(["cs", "nc1", "nc2"]),
});
export async function rerunCrawl(input: unknown): Promise<{ ok: true }> {
  const data = RerunInput.parse(input);
  const { userId } = await requireAdmin();
  await enqueue(JOB_NAMES.CHECK_DATA_READY, {
    date: data.date,
    basecamp: data.basecamp,
    attempt: 1,
  });
  await writeAuditLog({
    user_id: userId,
    action: "CRAWLER_MANUAL_RERUN",
    target_type: "crawler",
    target_id: data.date,
    after: data as unknown as Record<string, unknown>,
  });
  return { ok: true };
}

const BackfillRangeInput = z.object({
  job: z.enum(["minigame", "daily", "portrait", "profile"]),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  basecamp: z.enum(["cs", "nc1", "nc2"]),
});

const JOB_MAP = {
  minigame: JOB_NAMES.FETCH_MINIGAME,
  daily: JOB_NAMES.FETCH_DAILY,
  portrait: JOB_NAMES.FETCH_PORTRAIT,
  profile: JOB_NAMES.FETCH_PROFILE,
};

/** 手动触发快手同步（成员 / 历史直播 / 今日实时） */
const TriggerKuaishouSyncInput = z.object({
  type: z.enum(["members", "history", "today"]),
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export async function triggerKuaishouSync(input: unknown): Promise<{ ok: true }> {
  const data = TriggerKuaishouSyncInput.parse(input);
  const { userId } = await requireAdmin();
  const jobName =
    data.type === "members"
      ? JOB_NAMES.SYNC_KUAISHOU_MEMBERS
      : data.type === "history"
        ? JOB_NAMES.SYNC_KUAISHOU_HISTORY_LIVE
        : JOB_NAMES.SYNC_KUAISHOU_TODAY_LIVE;
  const payload = data.type === "history" ? { fromDate: data.fromDate, toDate: data.toDate } : {};
  await enqueue(jobName, payload);
  await writeAuditLog({
    user_id: userId,
    action: "CRAWLER_KUAISHOU_TRIGGER",
    target_type: "crawler",
    target_id: data.type,
    after: data as unknown as Record<string, unknown>,
  });
  return { ok: true };
}

/** 按类型 × 日期范围批量入队（每天一个 job）。用于补漏数据，不触发其它采集任务。*/
export async function backfillRange(input: unknown): Promise<{ ok: true; days: number }> {
  const data = BackfillRangeInput.parse(input);
  const { userId } = await requireAdmin();
  const start = new Date(data.from + "T00:00:00");
  const end = new Date(data.to + "T00:00:00");
  if (start > end) throw new Error("from > to");
  const jobName = JOB_MAP[data.job];
  let days = 0;
  for (let t = start.getTime(); t <= end.getTime(); t += 86400_000) {
    const d = new Date(t);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    await enqueue(jobName, { date, basecamp: data.basecamp, attempt: 1 });
    days++;
  }
  await writeAuditLog({
    user_id: userId,
    action: "CRAWLER_BACKFILL_RANGE",
    target_type: "crawler",
    target_id: `${data.job}:${data.from}~${data.to}`,
    after: { ...data, days } as unknown as Record<string, unknown>,
  });
  return { ok: true, days };
}

const SaveCookieInput = z.object({
  basecamp: z.enum(["cs", "nc1", "nc2"]),
  cookies: z.record(z.string(), z.string()),
});
export async function saveCookieAction(input: unknown): Promise<{ ok: true }> {
  const data = SaveCookieInput.parse(input);
  const { userId } = await requireAdmin();
  await saveCookies(data.basecamp as Basecamp, data.cookies);
  await writeAuditLog({
    user_id: userId,
    action: "CRAWLER_COOKIE_REFRESH",
    target_type: "crawler",
    target_id: data.basecamp,
  });
  return { ok: true };
}

const FieldAliasInput = z.object({
  table_name: z.string().min(1),
  field_name: z.string().min(1),
  chinese_name: z.string().min(1),
  unit: z.string().optional(),
  hidden: z.boolean().default(false),
  sort_order: z.number().int().default(0),
  description: z.string().optional(),
});
export async function upsertFieldAlias(input: unknown): Promise<{ ok: true }> {
  const data = FieldAliasInput.parse(input);
  const { userId } = await requireAdmin();
  await db
    .insert(field_alias)
    .values({
      ...data,
      updated_by: userId,
      updated_at: new Date(),
    })
    .onConflictDoUpdate({
      target: [field_alias.table_name, field_alias.field_name],
      set: {
        chinese_name: data.chinese_name,
        unit: data.unit ?? null,
        hidden: data.hidden,
        sort_order: data.sort_order,
        description: data.description ?? null,
        updated_by: userId,
        updated_at: new Date(),
      },
    });
  await writeAuditLog({
    user_id: userId,
    action: "FIELD_ALIAS_UPSERT",
    target_type: "field_alias",
    target_id: `${data.table_name}.${data.field_name}`,
    after: data as unknown as Record<string, unknown>,
  });
  return { ok: true };
}
