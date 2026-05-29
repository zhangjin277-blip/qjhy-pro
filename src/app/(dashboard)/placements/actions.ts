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
} from "@/modules/placement/server";
import { requireModuleEdit } from "@/lib/admin-guard";
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
  const { userId } = await requireModuleEdit("placement");
  const result = await deleteBatchAndRecompute(batchId);
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
