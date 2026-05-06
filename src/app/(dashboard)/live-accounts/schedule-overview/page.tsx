import { listAccounts } from "@/modules/live-account/server";
import { listBindings } from "@/modules/live-anchor";
import { ScheduleMatrix } from "./_components/schedule-matrix";

export default async function ScheduleOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const sp = await searchParams;
  const product = sp.product;

  const [accounts, allBindings] = await Promise.all([
    listAccounts(product ? { product } : {}),
    listBindings({}),
  ]);

  // 过滤 bindings 仅当前 accounts 的
  const accountIds = new Set(accounts.map((a) => a.id));
  const filteredBindings = allBindings
    .filter((b) => b.account_id && accountIds.has(b.account_id))
    .map((b) => ({
      id: b.id,
      account_id: b.account_id,
      dingtalk_user_id: b.dingtalk_user_id,
      anchor_name: b.anchor_name,
      time_slots: b.time_slots as [string, string][],
      rest_days: b.rest_days,
    }));

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">默认排班矩阵</h1>
        <div className="text-sm text-slate-500">
          仅展示，编辑请到「直播账号」详情页
          {product && ` · ${product}`}
        </div>
      </div>
      <ScheduleMatrix accounts={accounts} bindings={filteredBindings} />
    </div>
  );
}
