import { queryByAccount } from "@/modules/placement/server";
import { resolveFilter } from "@/modules/placement";
import { AccountTable } from "../_components/account-table";

export default async function ByAccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filter = resolveFilter(sp);
  const rows = await queryByAccount(filter);
  return <AccountTable rows={rows as never} />;
}
