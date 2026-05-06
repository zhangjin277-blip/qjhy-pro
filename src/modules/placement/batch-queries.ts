import "server-only";
import { db } from "@/db/client";
import { placement_import_batch } from "@/db/schema/placements";
import { auth_user } from "@/db/schema/auth";
import { desc, eq } from "drizzle-orm";

export async function listBatches(opts?: { limit?: number; offset?: number }) {
  return db
    .select({
      id: placement_import_batch.id,
      source: placement_import_batch.source,
      file_name: placement_import_batch.file_name,
      dataset_id: placement_import_batch.dataset_id,
      date_range_from: placement_import_batch.date_range_from,
      date_range_to: placement_import_batch.date_range_to,
      row_count: placement_import_batch.row_count,
      rows_inserted: placement_import_batch.rows_inserted,
      rows_updated: placement_import_batch.rows_updated,
      rows_skipped: placement_import_batch.rows_skipped,
      status: placement_import_batch.status,
      uploaded_by: placement_import_batch.uploaded_by,
      uploaded_by_name: auth_user.name,
      uploaded_at: placement_import_batch.uploaded_at,
    })
    .from(placement_import_batch)
    .leftJoin(auth_user, eq(placement_import_batch.uploaded_by, auth_user.id))
    .orderBy(desc(placement_import_batch.uploaded_at))
    .limit(opts?.limit ?? 50)
    .offset(opts?.offset ?? 0);
}

export async function getBatchDetail(id: string) {
  const [batch] = await db
    .select()
    .from(placement_import_batch)
    .where(eq(placement_import_batch.id, id));
  return batch ?? null;
}
