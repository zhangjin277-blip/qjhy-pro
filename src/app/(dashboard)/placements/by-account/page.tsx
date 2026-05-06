import { queryByAccount } from "@/modules/placement/server";
import { resolveFilter } from "@/modules/placement";
import { AccountTable } from "../_components/account-table";
import { CsvExportButton } from "../_components/csv-export-button";

export default async function ByAccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filter = resolveFilter(sp);
  const rows = await queryByAccount(filter);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <CsvExportButton
          rows={rows as never}
          filename={`投放-按账号-${filter.date_from}_${filter.date_to}.csv`}
          columns={[
            { key: "account_name", label: "账号" },
            { key: "placement_label", label: "投放标签" },
            { key: "platform", label: "平台" },
            { key: "cost", label: "消耗" },
            { key: "activations", label: "激活" },
            { key: "payment", label: "付费" },
          ]}
        />
      </div>
      <AccountTable rows={rows as never} />
    </div>
  );
}
