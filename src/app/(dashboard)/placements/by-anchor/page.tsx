import { queryByAnchor } from "@/modules/placement/server";
import { resolveFilter } from "@/modules/placement";
import { AnchorTable } from "../_components/anchor-table";
import { CsvExportButton } from "../_components/csv-export-button";

export default async function ByAnchorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filter = resolveFilter(sp);
  const rows = await queryByAnchor(filter);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <CsvExportButton
          rows={rows as never}
          filename={`投放-按主播-${filter.date_from}_${filter.date_to}.csv`}
          columns={[
            { key: "anchor_name", label: "主播" },
            { key: "business_line", label: "业务线" },
            { key: "cost", label: "归因消耗" },
            { key: "activations", label: "激活" },
            { key: "payment", label: "付费" },
            { key: "account_count", label: "覆盖账号" },
          ]}
        />
      </div>
      <AnchorTable rows={rows as never} />
    </div>
  );
}
