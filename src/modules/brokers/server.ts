import "server-only";
import { db } from "@/db/client";
import { anchor_profile, broker_user_mapping, dingtalk_user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fuzzyMatchBroker } from "./matcher";

/**
 * 同步：扫描 anchor_profile 拿到所有 distinct broker_id+broker_name，
 * 跟 dingtalk_user 做 fuzzy match。
 * 已有 manual 映射不动。
 */
export async function syncBrokerMappings(): Promise<{ matched: number; pending: number }> {
  const brokers = await db
    .selectDistinct({
      broker_id: anchor_profile.broker_id,
      broker_name: anchor_profile.broker_name,
    })
    .from(anchor_profile);

  const users = await db
    .select({ user_id: dingtalk_user.user_id, name: dingtalk_user.name })
    .from(dingtalk_user);

  let matched = 0;
  let pending = 0;
  for (const b of brokers) {
    if (!b.broker_id || !b.broker_name) continue;
    const existing = await db
      .select()
      .from(broker_user_mapping)
      .where(eq(broker_user_mapping.broker_id, b.broker_id));
    if (existing[0]?.match_source === "manual") continue; // 已手工映射不覆盖

    const m = fuzzyMatchBroker(b.broker_name, users);
    await db
      .insert(broker_user_mapping)
      .values({
        broker_id: b.broker_id,
        broker_name: b.broker_name,
        dingtalk_user_id: m?.user_id ?? null,
        match_source: m ? "auto" : "pending",
        matched_at: m ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: broker_user_mapping.broker_id,
        set: {
          broker_name: b.broker_name,
          dingtalk_user_id: m?.user_id ?? null,
          match_source: m ? "auto" : "pending",
          matched_at: m ? new Date() : null,
          updated_at: new Date(),
        },
      });
    if (m) matched++;
    else pending++;
  }
  return { matched, pending };
}

export async function listBrokerMappings(): Promise<
  {
    broker_id: string;
    broker_name: string;
    dingtalk_user_id: string | null;
    user_name: string | null;
    match_source: "auto" | "manual" | "pending";
  }[]
> {
  const rows = await db
    .select({
      broker_id: broker_user_mapping.broker_id,
      broker_name: broker_user_mapping.broker_name,
      dingtalk_user_id: broker_user_mapping.dingtalk_user_id,
      match_source: broker_user_mapping.match_source,
      user_name: dingtalk_user.name,
    })
    .from(broker_user_mapping)
    .leftJoin(dingtalk_user, eq(broker_user_mapping.dingtalk_user_id, dingtalk_user.user_id));
  return rows;
}
