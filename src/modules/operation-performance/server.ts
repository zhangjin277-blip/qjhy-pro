import "server-only";
import { and, asc, countDistinct, eq, inArray, max } from "drizzle-orm";
import { db } from "@/db/client";
import {
  anchor_daily,
  anchor_profile,
  broker_user_mapping,
  dingtalk_user,
  operation_monthly_target,
} from "@/db/schema";
import { getDashboardOverview } from "@/modules/dashboard/server";
import type { OperationPerformanceResponse, OperationTargetRow } from "./types";

function monthRange(month: string, latestDataDate: string | null): { from: string; to: string } {
  const from = `${month}-01`;
  const [year, monthNumber] = month.split("-").map(Number);
  const end = new Date(Date.UTC(year ?? 1970, monthNumber ?? 1, 0)).toISOString().slice(0, 10);
  if (!latestDataDate || latestDataDate < from) return { from, to: from };
  return { from, to: latestDataDate < end ? latestDataDate : end };
}

function progress(value: number, target: number | null) {
  return {
    target,
    completionPercent:
      target === null ? null : target === 0 ? (value > 0 ? 100 : 0) : (value / target) * 100,
    remaining: target === null ? null : Math.max(target - value, 0),
  };
}

export async function getOperationPerformance(
  userId: string,
  month: string,
): Promise<OperationPerformanceResponse> {
  const [[user], brokers, [latest], [target]] = await Promise.all([
    db
      .select({ id: dingtalk_user.user_id, name: dingtalk_user.name })
      .from(dingtalk_user)
      .where(eq(dingtalk_user.user_id, userId)),
    db
      .select({ id: broker_user_mapping.broker_id, name: broker_user_mapping.broker_name })
      .from(broker_user_mapping)
      .where(eq(broker_user_mapping.dingtalk_user_id, userId)),
    db.select({ date: max(anchor_daily.date) }).from(anchor_daily),
    db
      .select()
      .from(operation_monthly_target)
      .where(
        and(
          eq(operation_monthly_target.user_id, userId),
          eq(operation_monthly_target.month, month),
        ),
      ),
  ]);
  const range = monthRange(month, latest?.date ?? null);
  const brokerIds = brokers.map((broker) => broker.id);
  const [overview, [anchorCount]] = await Promise.all([
    getDashboardOverview(
      range.from,
      range.to,
      brokerIds.length ? { kind: "broker_ids", ids: brokerIds } : { kind: "reject" },
    ),
    brokerIds.length
      ? db
          .select({ count: countDistinct(anchor_profile.anchor_id) })
          .from(anchor_profile)
          .where(inArray(anchor_profile.broker_id, brokerIds))
      : Promise.resolve([{ count: 0 }]),
  ]);
  const value = (key: "total_fan_ticket" | "flow" | "active_anchor_count") => {
    const row = overview.breakdown.find((item) => item.metric === key);
    return (
      (row?.ddz.total.value ?? 0) + (row?.three.total.value ?? 0) + (row?.zhaohua.total.value ?? 0)
    );
  };
  const values = {
    total_fan_ticket: value("total_fan_ticket"),
    flow: value("flow"),
    active_anchor_count: value("active_anchor_count"),
  };
  const targets = {
    total_fan_ticket: target ? Number(target.fan_ticket_target) : null,
    flow: target ? Number(target.flow_target) : null,
    active_anchor_count: target ? Number(target.active_anchor_target) : null,
  };
  return {
    month,
    dateFrom: range.from,
    dateTo: range.to,
    user: user ?? { id: userId, name: "未同步用户" },
    managedAnchorCount: Number(anchorCount?.count ?? 0),
    brokerNames: brokers.map((broker) => broker.name),
    metrics: [
      {
        key: "total_fan_ticket",
        label: "音浪",
        value: values.total_fan_ticket,
        ...progress(values.total_fan_ticket, targets.total_fan_ticket),
      },
      { key: "flow", label: "流水", value: values.flow, ...progress(values.flow, targets.flow) },
      {
        key: "active_anchor_count",
        label: "有效开播主播",
        value: values.active_anchor_count,
        ...progress(values.active_anchor_count, targets.active_anchor_count),
      },
    ],
  };
}

export async function listOperationTargets(month: string): Promise<OperationTargetRow[]> {
  const operators = await db
    .select({
      userId: dingtalk_user.user_id,
      name: dingtalk_user.name,
      brokerName: broker_user_mapping.broker_name,
      brokerId: broker_user_mapping.broker_id,
    })
    .from(broker_user_mapping)
    .innerJoin(dingtalk_user, eq(dingtalk_user.user_id, broker_user_mapping.dingtalk_user_id))
    .orderBy(asc(dingtalk_user.name));
  const userIds = [...new Set(operators.map((row) => row.userId))];
  if (!userIds.length) return [];
  const [targets, counts] = await Promise.all([
    db
      .select()
      .from(operation_monthly_target)
      .where(
        and(
          eq(operation_monthly_target.month, month),
          inArray(operation_monthly_target.user_id, userIds),
        ),
      ),
    db
      .select({
        userId: broker_user_mapping.dingtalk_user_id,
        count: countDistinct(anchor_profile.anchor_id),
      })
      .from(broker_user_mapping)
      .innerJoin(anchor_profile, eq(anchor_profile.broker_id, broker_user_mapping.broker_id))
      .where(inArray(broker_user_mapping.dingtalk_user_id, userIds))
      .groupBy(broker_user_mapping.dingtalk_user_id),
  ]);
  const targetMap = new Map(targets.map((target) => [target.user_id, target]));
  const countMap = new Map(counts.map((row) => [row.userId, Number(row.count)]));
  return userIds.map((userId) => {
    const rows = operators.filter((row) => row.userId === userId);
    const target = targetMap.get(userId);
    return {
      userId,
      name: rows[0]?.name ?? "未命名",
      brokerNames: rows.map((row) => row.brokerName),
      managedAnchorCount: countMap.get(userId) ?? 0,
      fanTicketTarget: target ? Number(target.fan_ticket_target) : null,
      flowTarget: target ? Number(target.flow_target) : null,
      activeAnchorTarget: target ? Number(target.active_anchor_target) : null,
    };
  });
}
