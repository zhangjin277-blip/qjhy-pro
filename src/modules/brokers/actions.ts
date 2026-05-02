"use server";

import { db } from "@/db/client";
import { broker_user_mapping } from "@/db/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { writeAuditLog } from "@/lib/audit";
import { eq } from "drizzle-orm";
import { SetBrokerMappingInput } from "./schema";

export async function setBrokerMapping(input: unknown): Promise<{ ok: true }> {
  const data = SetBrokerMappingInput.parse(input);
  const { userId: opUser } = await requireAdmin();

  await db
    .update(broker_user_mapping)
    .set({
      dingtalk_user_id: data.dingtalk_user_id,
      match_source: "manual",
      matched_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(broker_user_mapping.broker_id, data.broker_id));

  await writeAuditLog({
    user_id: opUser,
    action: "BROKER_MAPPING_SET",
    target_type: "broker",
    target_id: data.broker_id,
    after: data as unknown as Record<string, unknown>,
  });
  return { ok: true };
}
