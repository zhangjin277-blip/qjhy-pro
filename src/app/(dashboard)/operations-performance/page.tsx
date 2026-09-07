import { redirect } from "next/navigation";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { listOperationTargets } from "@/modules/operation-performance/server";
import { saveOperationTarget } from "@/modules/operation-performance";
import { resolvePermission } from "@/modules/permissions/server";

function currentMonth(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

export default async function OperationsPerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const identity = await getCurrentDingtalkUser();
  if (identity.kind === "unauth") redirect("/login");
  if (identity.kind === "user_not_synced") return <div className="p-8">当前账号未同步。</div>;
  if (!identity.isEmergency) {
    const permission = await resolvePermission(identity.dingtalkUserId, "dashboard");
    if (permission.scope !== "all") return <div className="p-8">暂无运营目标配置权限。</div>;
  }
  const params = await searchParams;
  const monthCandidate = params.month ?? "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthCandidate) ? monthCandidate : currentMonth();
  const rows = await listOperationTargets(month);

  return (
    <div className="space-y-4 px-1 py-1 md:px-1.5 md:py-1.5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-base font-semibold text-slate-800">运营目标</h1>
          <p className="mt-1 text-xs text-slate-500">按月维护运营的音浪、流水和有效开播主播目标</p>
        </div>
        <form className="flex items-center gap-2">
          <input
            type="month"
            name="month"
            defaultValue={month}
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
          />
          <button className="h-9 rounded-md border border-slate-300 bg-white px-4 text-sm">
            查看
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-md border bg-white">
        <div className="grid grid-cols-[minmax(150px,1.2fr)_110px_repeat(3,minmax(130px,1fr))_90px] gap-3 border-b bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600">
          <span>运营 / 经纪人</span>
          <span>管理主播</span>
          <span>音浪目标</span>
          <span>流水目标</span>
          <span>有效开播主播</span>
          <span>操作</span>
        </div>
        {rows.map((row) => (
          <form
            key={row.userId}
            action={saveOperationTarget}
            className="grid grid-cols-[minmax(150px,1.2fr)_110px_repeat(3,minmax(130px,1fr))_90px] items-center gap-3 border-b px-4 py-3 last:border-b-0"
          >
            <input type="hidden" name="userId" value={row.userId} />
            <input type="hidden" name="month" value={month} />
            <div className="min-w-0">
              <div className="font-medium text-slate-800">{row.name}</div>
              <div className="mt-1 truncate text-xs text-slate-500">
                {row.brokerNames.join("、")}
              </div>
            </div>
            <span className="text-sm text-slate-700">{row.managedAnchorCount} 人</span>
            <input
              className="h-9 rounded-md border px-3 text-sm"
              type="number"
              min="0"
              step="0.01"
              name="fanTicketTarget"
              defaultValue={row.fanTicketTarget ?? ""}
              required
            />
            <input
              className="h-9 rounded-md border px-3 text-sm"
              type="number"
              min="0"
              step="0.01"
              name="flowTarget"
              defaultValue={row.flowTarget ?? ""}
              required
            />
            <input
              className="h-9 rounded-md border px-3 text-sm"
              type="number"
              min="0"
              step="1"
              name="activeAnchorTarget"
              defaultValue={row.activeAnchorTarget ?? ""}
              required
            />
            <button className="h-9 rounded-md bg-slate-800 px-3 text-sm text-white">保存</button>
          </form>
        ))}
        {rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">暂无已绑定经纪人的运营人员</div>
        ) : null}
      </div>
    </div>
  );
}
