"use server";
import { db } from "@/db/client";
import { schedule_override } from "@/db/schema/schedule-override";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { markDirtyByAccountDate, runAttributionJob } from "@/modules/placement-attribution/server";
import { overrideInputSchema } from "./schema";
import { revalidatePath } from "next/cache";

export async function createOverride(input: unknown) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("UNAUTHORIZED");

  const parsed = overrideInputSchema.parse(input);

  await db.insert(schedule_override).values({
    account_id: parsed.account_id,
    date: parsed.date,
    dingtalk_user_id: parsed.dingtalk_user_id,
    time_slots: parsed.time_slots,
    reason: parsed.reason ?? null,
    created_by: session.user.id,
  });

  await markDirtyByAccountDate(parsed.account_id, parsed.date);
  await runAttributionJob({ max_rows: 200 });

  revalidatePath("/live-accounts");
  revalidatePath("/placements");
}

export async function deleteOverride(id: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("UNAUTHORIZED");

  const [removed] = await db
    .delete(schedule_override)
    .where(eq(schedule_override.id, id))
    .returning();

  if (removed) {
    await markDirtyByAccountDate(removed.account_id, removed.date);
    await runAttributionJob({ max_rows: 200 });
  }

  revalidatePath("/live-accounts");
  revalidatePath("/placements");
}
