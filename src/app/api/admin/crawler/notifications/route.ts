import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { crawler_notification_setting } from "@/db/schema";
import { requireAdmin, requirePoint } from "@/lib/admin-guard";
import { writeAuditLog } from "@/lib/audit";
import { NOTIFICATION_MODULES } from "@/lib/notify/catalog";

export async function GET(): Promise<NextResponse> {
  await requireAdmin();
  let rows: { module_key: string; enabled: boolean }[] = [];
  let storageReady = true;
  try {
    rows = await db.select().from(crawler_notification_setting);
  } catch {
    storageReady = false;
  }
  return NextResponse.json({
    storageReady,
    settings: NOTIFICATION_MODULES.map((item) => ({
      module_key: item.module_key,
      module_name: item.module_name,
      description: item.description,
      enabled: rows.find((row) => row.module_key === item.module_key)?.enabled ?? true,
      configured: Boolean(
        process.env[item.webhook] || ("fallback" in item && process.env[item.fallback]),
      ),
    })),
  });
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const { userId } = await requirePoint("crawler", "run_jobs");
  const body = (await request.json()) as { moduleKey?: string; enabled?: boolean };
  const item = NOTIFICATION_MODULES.find((item) => item.module_key === body.moduleKey);
  if (!item || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }
  try {
    await db
      .insert(crawler_notification_setting)
      .values({
        module_key: item.module_key,
        module_name: item.module_name,
        description: item.description,
        enabled: body.enabled,
      })
      .onConflictDoUpdate({
        target: crawler_notification_setting.module_key,
        set: { enabled: body.enabled, updated_at: new Date() },
      });
  } catch {
    return NextResponse.json({ error: "通知配置暂不可写，请检查数据库迁移" }, { status: 503 });
  }
  await writeAuditLog({
    user_id: userId,
    action: "NOTIFICATION_SETTING_UPDATE",
    target_type: "notification",
    target_id: item.module_key,
    after: { enabled: body.enabled },
  });
  return NextResponse.json({ ok: true });
}
