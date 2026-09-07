"use server";
import {
  queryAccountHourly,
  queryAnchorCheckin,
  deleteBatchAndRecompute,
  resolvePlacementScope,
  type BoardFilter,
  type AccountHourlyRow,
  type ScheduleRow,
  type DeleteBatchResult,
  queryPlacementTimeRange,
  type PlacementTimeRangeRow,
} from "@/modules/placement/server";
import type { TimeRangeSelection } from "@/modules/placement";
import { runAttributionJob } from "@/modules/placement-attribution/server";
import { requirePoint } from "@/lib/admin-guard";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { writeAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export async function fetchAccountHourly(
  filter: BoardFilter,
  accountId: string,
): Promise<AccountHourlyRow[]> {
  // server action：不信任 client 传入的 scope，重新解析
  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind !== "ok") return [];
  const scope = await resolvePlacementScope(ctx.dingtalkUserId, ctx.isEmergency);
  if (scope.kind === "reject") return [];
  return queryAccountHourly({ ...filter, scope }, accountId);
}

/** 导出时段查询的全部筛选结果；scope 在服务端重新计算，不能信任客户端传入。 */
export async function exportPlacementTimeRange(
  request: Omit<TimeRangeSelection, "page"> & {
    date_from: string;
    date_to: string;
    dataset_ids?: string[];
  },
): Promise<PlacementTimeRangeRow[]> {
  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind !== "ok") return [];
  const scope = await resolvePlacementScope(ctx.dingtalkUserId, ctx.isEmergency);
  if (scope.kind === "reject") return [];
  const result = await queryPlacementTimeRange(
    {
      date_from: request.date_from,
      date_to: request.date_to,
      dataset_ids: request.dataset_ids,
      scope,
      start_hour: request.start_hour,
      end_hour: request.end_hour,
      account_id: request.account_id,
      page: 1,
    },
    { pageSize: 1_000_000 },
  );
  return result.rows;
}

export async function fetchAnchorCheckin(
  filter: BoardFilter,
  anchorLabel: string | null,
): Promise<ScheduleRow[]> {
  if (!anchorLabel) return [];
  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind !== "ok") return [];
  const scope = await resolvePlacementScope(ctx.dingtalkUserId, ctx.isEmergency);
  if (scope.kind === "reject") return [];
  const nextFilter = { ...filter, scope, anchor_label: anchorLabel };
  return queryAnchorCheckin(nextFilter, anchorLabel);
}

export async function deleteBatchAction(batchId: string): Promise<DeleteBatchResult> {
  const { userId } = await requirePoint("placement", "upload");
  const result = await deleteBatchAndRecompute(batchId);
  // 重算行 import_batch_id=null，带 batch 过滤选不到 → 必须全量扫 dirty。
  // job 内部分批循环到没有剩余 dirty 行；失败不阻塞删除本身（04:00 cron 兜底）。
  try {
    await runAttributionJob();
  } catch (err) {
    console.error("[placements] post-delete attribution failed:", err);
  }
  await writeAuditLog({
    user_id: userId,
    action: "PLACEMENT_BATCH_DELETE",
    target_type: "placement_import_batch",
    target_id: batchId,
    after: result as unknown as Record<string, unknown>,
  });
  revalidatePath("/placements/batches");
  revalidatePath("/placements");
  return result;
}
