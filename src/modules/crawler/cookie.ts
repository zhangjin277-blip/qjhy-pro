import "server-only";
import { db } from "@/db/client";
import { crawler_cookie_session } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { notifyCookieExpired } from "@/lib/notify";

export type Basecamp =
  | "cs"
  | "nc1"
  | "nc2"
  | "kuaishou"
  | "kuaishou_creator"
  | "lingji"
  | "douyin_creator";

export interface CookieRecord {
  basecamp: Basecamp;
  cookies: Record<string, string>;
  status: "active" | "expired";
  captured_at: Date;
}

/** 取当前 base 的 active cookies；无则抛错 */
export async function getActiveCookies(basecamp: Basecamp): Promise<Record<string, string>> {
  const [row] = await db
    .select()
    .from(crawler_cookie_session)
    .where(eq(crawler_cookie_session.basecamp, basecamp));
  if (!row || row.status !== "active") {
    throw new Error(`No active cookie for basecamp=${basecamp}`);
  }
  return row.cookies as Record<string, string>;
}

/** 标记 Cookie 失效（page-fetch 抛 CookieExpiredError 时调） */
export async function markCookieExpired(basecamp: Basecamp): Promise<void> {
  // 只在 active→expired 转换时更新并通知，避免失效后每次重试都刷屏
  const rows = await db
    .update(crawler_cookie_session)
    .set({ status: "expired", last_check_at: new Date(), updated_at: new Date() })
    .where(
      and(
        eq(crawler_cookie_session.basecamp, basecamp),
        eq(crawler_cookie_session.status, "active"),
      ),
    )
    .returning({ basecamp: crawler_cookie_session.basecamp });
  if (rows.length === 0) return; // 已是 expired，不重复通知
  const platform =
    basecamp === "kuaishou_creator"
      ? "快手创作者中心（AI漫剧）"
      : basecamp === "kuaishou"
        ? "快手工会后台"
        : basecamp === "lingji"
          ? "抖音灵机"
          : basecamp === "douyin_creator"
            ? "抖音创作者中心"
            : "抖音";
  await notifyCookieExpired({ platform, basecamp });
}

/** admin 扫码续期后写入新 Cookie */
export async function saveCookies(
  basecamp: Basecamp,
  cookies: Record<string, string>,
): Promise<void> {
  await db
    .insert(crawler_cookie_session)
    .values({
      basecamp,
      cookies,
      status: "active",
      captured_at: new Date(),
      last_check_at: new Date(),
      updated_at: new Date(),
    })
    .onConflictDoUpdate({
      target: crawler_cookie_session.basecamp,
      set: {
        cookies,
        status: "active",
        captured_at: new Date(),
        last_check_at: new Date(),
        updated_at: new Date(),
      },
    });
}
