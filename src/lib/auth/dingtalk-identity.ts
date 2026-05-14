import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auth_account, dingtalk_user } from "@/db/schema";
import { fetchUseridByUnionid } from "@/lib/dingtalk";

export type ResolvedDingtalkIdentity =
  | {
      kind: "ok";
      dingtalkUserId: string;
      dingtalkUnionId: string;
      name: string;
      title: string | null;
    }
  | {
      kind: "user_not_synced";
      dingtalkUnionId: string | null;
    };

/**
 * better-auth 的 session.user.id 是 auth_user.id，不等于钉钉 userid。
 *
 * 稳定链路：
 * auth_user.id -> auth_account(provider=dingtalk).account_id(钉钉 unionId)
 * -> 本企业 dingtalk_user.user_id -> 权限系统。
 */
export async function resolveDingtalkIdentityByAuthUserId(
  authUserId: string,
): Promise<ResolvedDingtalkIdentity> {
  const [account] = await db
    .select({ accountId: auth_account.accountId })
    .from(auth_account)
    .where(and(eq(auth_account.userId, authUserId), eq(auth_account.providerId, "dingtalk")));

  const unionId = account?.accountId ?? null;
  if (!unionId) {
    return { kind: "user_not_synced", dingtalkUnionId: null };
  }

  const [localUser] = await db
    .select({
      user_id: dingtalk_user.user_id,
      name: dingtalk_user.name,
      title: dingtalk_user.title,
    })
    .from(dingtalk_user)
    .where(and(eq(dingtalk_user.unionid, unionId), eq(dingtalk_user.active, true)));

  if (localUser) {
    return {
      kind: "ok",
      dingtalkUserId: localUser.user_id,
      dingtalkUnionId: unionId,
      name: localUser.name,
      title: localUser.title,
    };
  }

  const enterpriseUserId = await fetchUseridByUnionid(unionId).catch((err) => {
    console.warn("[auth] dingtalk getbyunionid failed:", err);
    return null;
  });
  if (!enterpriseUserId) {
    return { kind: "user_not_synced", dingtalkUnionId: unionId };
  }

  const [enterpriseUser] = await db
    .select({
      user_id: dingtalk_user.user_id,
      name: dingtalk_user.name,
      title: dingtalk_user.title,
    })
    .from(dingtalk_user)
    .where(and(eq(dingtalk_user.user_id, enterpriseUserId), eq(dingtalk_user.active, true)));

  if (!enterpriseUser) {
    return { kind: "user_not_synced", dingtalkUnionId: unionId };
  }

  await db
    .update(dingtalk_user)
    .set({ unionid: unionId, synced_at: sql`NOW()` })
    .where(eq(dingtalk_user.user_id, enterpriseUser.user_id))
    .catch((err) => {
      console.warn("[auth] dingtalk unionId repair failed:", err);
    });

  return {
    kind: "ok",
    dingtalkUserId: enterpriseUser.user_id,
    dingtalkUnionId: unionId,
    name: enterpriseUser.name,
    title: enterpriseUser.title,
  };
}
