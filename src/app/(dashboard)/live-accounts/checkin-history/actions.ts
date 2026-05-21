"use server";

import { getCheckinDay, type CheckinDayResult } from "@/modules/checkin/queries";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function fetchCheckinDay(
  date: string,
  product: string,
): Promise<CheckinDayResult | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return await getCheckinDay(date, product || undefined);
}
