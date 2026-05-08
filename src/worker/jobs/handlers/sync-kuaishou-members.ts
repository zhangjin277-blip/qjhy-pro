import { db } from "@/db/client";
import { kuaishou_member, dingtalk_user } from "@/db/schema";
import { openKuaishouPage, CookieExpiredError } from "@/lib/puppeteer";
import {
  getActiveCookies,
  markCookieExpired,
  notifyCrawlerError,
  fetchKuaishouMembers,
  mapKuaishouMember,
  normalizePersonName,
} from "@/modules/crawler/server";

interface SyncResult {
  total: number;
  inserted: number;
  updated: number;
  brokerUnmatched: number;
  productInferred: number;
}

/**
 * 拉快手公会「成员管理」全量 → UPSERT kuaishou_member（公会基础数据，独立于 live_account）。
 * 主播明细页直接展示这张表；live_account 的 stub 通过单独的「匹配脚本」按昵称从这张表填字段。
 */
export async function syncKuaishouMembersHandler(): Promise<SyncResult> {
  const cookies = await getActiveCookies("kuaishou");
  const page = await openKuaishouPage(cookies);
  try {
    const rawMembers = await fetchKuaishouMembers(page);
    console.log(`[sync-kuaishou-members] fetched ${rawMembers.length} members from API`);

    const dingUsers = await db
      .select({ user_id: dingtalk_user.user_id, name: dingtalk_user.name })
      .from(dingtalk_user);
    const nameMap = new Map<string, string>();
    for (const u of dingUsers) {
      if (u.name) {
        nameMap.set(u.name, u.user_id);
        const norm = normalizePersonName(u.name);
        if (norm && norm !== u.name) nameMap.set(norm, u.user_id);
      }
    }

    let inserted = 0;
    let updated = 0;
    let brokerUnmatched = 0;
    let productInferred = 0;

    for (const raw of rawMembers) {
      const mapped = mapKuaishouMember(raw, nameMap);
      if (mapped.product) productInferred++;
      if (!mapped.agent_dingtalk_user_id && mapped.raw_payload.broker_name_raw) {
        brokerUnmatched++;
      }

      const userId = mapped.platform_account_id;
      const values = {
        user_id: userId,
        member_name: mapped.account_name,
        avatar: mapped.avatar,
        fans_count: mapped.raw_payload.fans_count,
        broker_name_raw: mapped.raw_payload.broker_name_raw,
        agent_dingtalk_user_id: mapped.agent_dingtalk_user_id,
        inferred_product: mapped.product,
        content_category: mapped.raw_payload.content_category_raw,
        joined_at: mapped.raw_payload.joined_at,
        contract_expire_at: mapped.raw_payload.contract_expire_at,
        renewal_status: mapped.raw_payload.renewal_status,
        contract_renew_type: mapped.raw_payload.contract_renew_type,
        last_live_time: mapped.raw_payload.last_live_time
          ? new Date(mapped.raw_payload.last_live_time)
          : null,
        last_photo_time: mapped.raw_payload.last_photo_time
          ? new Date(mapped.raw_payload.last_photo_time)
          : null,
        living_url: typeof raw.livingUrl === "string" ? raw.livingUrl : null,
        raw: raw as unknown as Record<string, unknown>,
        synced_at: new Date(),
        updated_at: new Date(),
      };

      const result = await db
        .insert(kuaishou_member)
        .values(values)
        .onConflictDoUpdate({
          target: kuaishou_member.user_id,
          set: {
            member_name: values.member_name,
            avatar: values.avatar,
            fans_count: values.fans_count,
            broker_name_raw: values.broker_name_raw,
            agent_dingtalk_user_id: values.agent_dingtalk_user_id,
            inferred_product: values.inferred_product,
            content_category: values.content_category,
            joined_at: values.joined_at,
            contract_expire_at: values.contract_expire_at,
            renewal_status: values.renewal_status,
            contract_renew_type: values.contract_renew_type,
            last_live_time: values.last_live_time,
            last_photo_time: values.last_photo_time,
            living_url: values.living_url,
            raw: values.raw,
            synced_at: values.synced_at,
            updated_at: values.updated_at,
          },
        })
        .returning({ id: kuaishou_member.user_id, created_at: kuaishou_member.created_at });

      // 简易判断：created_at 在最近 5s 内 = 新插入
      const row = result[0];
      if (row && Date.now() - row.created_at.getTime() < 5000) {
        inserted++;
      } else {
        updated++;
      }
    }

    const summary: SyncResult = {
      total: rawMembers.length,
      inserted,
      updated,
      brokerUnmatched,
      productInferred,
    };
    console.log("[sync-kuaishou-members] done", summary);
    return summary;
  } catch (e) {
    if (e instanceof CookieExpiredError) {
      await markCookieExpired("kuaishou");
      await notifyCrawlerError({
        type: "cookie_expired",
        detail: `[kuaishou] ${e.message}`,
        action: "Admin 扫码续期快手机构后台",
      });
    } else {
      await notifyCrawlerError({
        type: "job_failed",
        detail: `sync-kuaishou-members failed: ${(e as Error).message}`,
      });
    }
    throw e;
  } finally {
    await page.close();
  }
}
