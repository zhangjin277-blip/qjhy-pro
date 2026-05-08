import "server-only";
import { db } from "@/db/client";
import { kuaishou_member, dingtalk_user } from "@/db/schema";
import { and, eq, isNull, sql, type SQL } from "drizzle-orm";

export interface KuaishouAnchorListFilters {
  product?: string;
  search?: string;
}

export interface KuaishouAnchorRow {
  id: string;
  account_name: string;
  platform_account_id: string;
  avatar: string | null;
  product: string;
  agent_dingtalk_user_id: string | null;
  agent_name: string | null;
  fans_count: number | null;
  joined_at: string | null;
  contract_expire_at: string | null;
  renewal_status: string | null;
  broker_name_raw: string | null;
  live_status: string;
  updated_at: Date;
}

export interface KuaishouAnchorKpi {
  total: number;
  withAgent: number;
  contractExpiringIn90Days: number;
  renewalPending: number;
}

/**
 * 主播明细列表（公会全量数据，独立于 live_account）。
 * 主播明细 = kuaishou_member 全表，按 product/search 筛选。
 *
 * 注意：暂时不做 perm scope 过滤（公会成员是基础信息）。emergencyMode 仅用于保留原 API 签名兼容。
 */
export async function listKuaishouAnchors(
  _userId: string,
  filters: KuaishouAnchorListFilters = {},
  _emergencyMode = false,
): Promise<KuaishouAnchorRow[]> {
  const conds: SQL[] = [];
  if (filters.product && filters.product !== "all") {
    if (filters.product === "未分类") {
      conds.push(isNull(kuaishou_member.inferred_product));
    } else {
      conds.push(eq(kuaishou_member.inferred_product, filters.product));
    }
  }
  if (filters.search) {
    const s = `%${filters.search}%`;
    conds.push(
      sql`(${kuaishou_member.member_name} ILIKE ${s} OR ${kuaishou_member.user_id} ILIKE ${s})`,
    );
  }

  const where = conds.length > 0 ? and(...conds) : undefined;

  const rows = await db
    .select({
      user_id: kuaishou_member.user_id,
      member_name: kuaishou_member.member_name,
      avatar: kuaishou_member.avatar,
      fans_count: kuaishou_member.fans_count,
      broker_name_raw: kuaishou_member.broker_name_raw,
      agent_dingtalk_user_id: kuaishou_member.agent_dingtalk_user_id,
      agent_name: dingtalk_user.name,
      inferred_product: kuaishou_member.inferred_product,
      joined_at: kuaishou_member.joined_at,
      contract_expire_at: kuaishou_member.contract_expire_at,
      renewal_status: kuaishou_member.renewal_status,
      last_live_time: kuaishou_member.last_live_time,
      living_url: kuaishou_member.living_url,
      updated_at: kuaishou_member.updated_at,
    })
    .from(kuaishou_member)
    .leftJoin(dingtalk_user, eq(kuaishou_member.agent_dingtalk_user_id, dingtalk_user.user_id))
    .where(where)
    .orderBy(sql`${kuaishou_member.fans_count} DESC NULLS LAST`);

  return rows.map((r) => ({
    id: r.user_id,
    account_name: r.member_name,
    platform_account_id: r.user_id,
    avatar: r.avatar,
    product: r.inferred_product ?? "未分类",
    agent_dingtalk_user_id: r.agent_dingtalk_user_id,
    agent_name: r.agent_name,
    fans_count: r.fans_count,
    joined_at: r.joined_at,
    contract_expire_at: r.contract_expire_at,
    renewal_status: r.renewal_status,
    broker_name_raw: r.broker_name_raw,
    live_status: r.living_url ? "living" : "unknown",
    updated_at: r.updated_at,
  }));
}

export async function queryKuaishouAnchorKpi(
  userId: string,
  filters: KuaishouAnchorListFilters = {},
  emergencyMode = false,
): Promise<KuaishouAnchorKpi> {
  const rows = await listKuaishouAnchors(userId, filters, emergencyMode);
  const today = new Date();
  const ninetyDaysLater = new Date(today.getTime() + 90 * 86400_000);

  let withAgent = 0;
  let contractExpiringIn90Days = 0;
  let renewalPending = 0;
  for (const r of rows) {
    if (r.agent_dingtalk_user_id) withAgent++;
    if (r.contract_expire_at) {
      const exp = new Date(r.contract_expire_at);
      if (exp >= today && exp <= ninetyDaysLater) contractExpiringIn90Days++;
    }
    if (
      r.renewal_status &&
      (r.renewal_status.includes("待确认") || r.renewal_status.includes("可发起续约"))
    ) {
      renewalPending++;
    }
  }

  return {
    total: rows.length,
    withAgent,
    contractExpiringIn90Days,
    renewalPending,
  };
}
