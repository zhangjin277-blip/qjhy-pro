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
