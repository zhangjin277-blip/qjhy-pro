import { queryByAnchor } from "@/modules/placement/server";
import { resolveFilter } from "@/modules/placement";
import { AnchorTable } from "../_components/anchor-table";

export default async function ByAnchorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filter = resolveFilter(sp);
  const rows = await queryByAnchor(filter);
  return <AnchorTable rows={rows as never} />;
}
