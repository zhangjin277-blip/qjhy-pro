"use server";
import {
  queryAccountHourly,
  deleteBatchAndRecompute,
  type BoardFilter,
  type AccountHourlyRow,
  type DeleteBatchResult,
} from "@/modules/placement/server";
import { requireAdmin } from "@/lib/admin-guard";
import { writeAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export async function fetchAccountHourly(
  filter: BoardFilter,
  accountId: string,
): Promise<AccountHourlyRow[]> {
  return queryAccountHourly(filter, accountId);
}

export async function deleteBatchAction(batchId: string): Promise<DeleteBatchResult> {
  const { userId } = await requireAdmin();
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
