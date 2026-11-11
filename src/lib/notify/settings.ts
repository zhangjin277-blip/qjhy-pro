import "server-only";
import { db } from "@/db/client";
import { crawler_notification_setting } from "@/db/schema";
import { eq } from "drizzle-orm";

/** 通知配置缺失时按开启处理，保证旧环境迁移前不静默丢告警。 */
export async function isNotificationEnabled(moduleKey: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ enabled: crawler_notification_setting.enabled })
      .from(crawler_notification_setting)
      .where(eq(crawler_notification_setting.module_key, moduleKey));
    return row?.enabled ?? true;
  } catch (error) {
    console.warn(`[notify] failed to read setting ${moduleKey}, keep enabled`, error);
    return true;
  }
}
