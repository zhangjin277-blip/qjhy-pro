"use server";
import {
  queryAccountHourly,
  type BoardFilter,
  type AccountHourlyRow,
} from "@/modules/placement/server";

export async function fetchAccountHourly(
  filter: BoardFilter,
  accountId: string,
): Promise<AccountHourlyRow[]> {
  return queryAccountHourly(filter, accountId);
}
