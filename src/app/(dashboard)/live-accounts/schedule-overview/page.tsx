import { listAccounts } from "@/modules/live-account/server";
import { listBindings } from "@/modules/live-anchor";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { redirect } from "next/navigation";
import { ScheduleMatrix } from "./_components/schedule-matrix";

export default async function ScheduleOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const sp = await searchParams;
  const product = sp.product;

  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind === "unauth") redirect("/login");
  if (ctx.kind === "user_not_synced") redirect("/login");

  const [allAccounts, allBindings] = await Promise.all([
    listAccounts(product ? { product } : {}, ctx.dingtalkUserId, ctx.isEmergency),
    listBindings({}),
  ]);
  const accounts = allAccounts.filter((a) => !a.deprecated_at); // 已废弃账号不进排班矩阵

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
    <div className="min-w-0 max-w-full space-y-3 px-1 py-1 md:px-1.5 md:py-1.5">
      <div className="flex items-center gap-1 border-b border-slate-200 pb-1">
        <span className="mr-2 px-3 py-1.5 text-sm font-semibold text-slate-700">默认排班矩阵</span>
        <div className="ml-auto px-3 text-sm text-slate-500">
          仅展示，编辑请到「直播账号」详情页
          {product && ` · ${product}`}
        </div>
      </div>
      <ScheduleMatrix accounts={accounts} bindings={filteredBindings} />
    </div>
  );
}
