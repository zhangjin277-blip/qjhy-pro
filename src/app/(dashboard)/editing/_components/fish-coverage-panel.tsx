"use client";
import type { FishCoverage, FishCoverageItem } from "@/modules/editing-task";

interface Props {
  coverage: FishCoverage;
}

interface AccountGroup {
  accountId: string;
  accountName: string;
  anchors: { id: string; name: string; uploaded: boolean }[];
}

interface ProductGroup {
  product: string;
  accounts: AccountGroup[];
}

function groupAll(items: FishCoverageItem[]): ProductGroup[] {
  const products = new Map<string, Map<string, AccountGroup>>();

  for (const it of items) {
    const accId = it.liveAccountId;
    const anchorId = it.anchorId ?? "_none";
    const anchorName = it.anchorName ?? "未知";

    let accMap = products.get(it.product);
    if (!accMap) {
      accMap = new Map();
      products.set(it.product, accMap);
    }
    let acc = accMap.get(accId);
    if (!acc) {
      acc = { accountId: accId, accountName: it.liveAccountName, anchors: [] };
      accMap.set(accId, acc);
    }
    if (!acc.anchors.some((a) => a.id === anchorId)) {
      acc.anchors.push({ id: anchorId, name: anchorName, uploaded: it.uploaded });
    }
  }

  return Array.from(products.entries()).map(([product, accMap]) => ({
    product,
    accounts: Array.from(accMap.values()),
  }));
}

export function FishCoveragePanel({ coverage }: Props) {
  if (coverage.total === 0) return null;

  const allDone = coverage.missing === 0;
  const groups = groupAll(coverage.items);

  return (
    <div
      className={`rounded-xl border p-4 ${
        allDone ? "border-green-200 bg-green-50/40" : "border-amber-200 bg-amber-50/40"
      }`}
    >
      <div className="flex items-center gap-3 text-sm">
        <span className="font-semibold text-slate-800">今日完成度</span>
        <span className="text-base font-semibold text-amber-600 tabular-nums">
          {coverage.uploaded} / {coverage.total}
        </span>
        {!allDone && <span className="text-xs text-slate-500">未上传 {coverage.missing} 人</span>}
        {allDone && <span className="text-xs text-green-700">全部上传完成</span>}
      </div>

      <div className="mt-3 space-y-2">
        {groups.map((g) => (
          <div key={g.product} className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
            <span className="text-xs font-medium text-slate-700">{g.product}</span>
            {g.accounts.map((acc) => (
              <div key={acc.accountId} className="flex flex-wrap items-baseline gap-1.5">
                <span className="text-xs text-slate-500">{acc.accountName}：</span>
                {acc.anchors.map((a) => (
                  <span
                    key={a.id}
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs ${
                      a.uploaded
                        ? "border-green-200 bg-green-50 text-green-600"
                        : "border-red-200 bg-red-50 text-red-600"
                    }`}
                  >
                    {a.name}
                  </span>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
