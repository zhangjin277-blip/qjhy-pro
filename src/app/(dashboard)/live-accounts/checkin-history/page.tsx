import { redirect } from "next/navigation";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { getCheckinDay } from "@/modules/checkin/queries";
import { canForceEndAnySession } from "@/modules/checkin/server";
import { CheckinHistoryClient } from "./_components/checkin-history-client";

export const dynamic = "force-dynamic";

function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function CheckinHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; product?: string }>;
}): Promise<React.JSX.Element> {
  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind === "unauth") redirect("/login?next=/live-accounts/checkin-history");
  if (ctx.kind === "user_not_synced") {
    return (
      <div className="p-6 text-sm text-red-600">
        当前账号尚未同步到钉钉用户表，无法计算权限。请联系管理员。
      </div>
    );
  }

  const sp = await searchParams;
  const date = sp.date ?? toLocalIsoDate(new Date());
  const product = sp.product ?? undefined;

  const [data, canForceEnd] = await Promise.all([
    getCheckinDay(date, product),
    canForceEndAnySession(ctx.dingtalkUserId, ctx.isEmergency),
  ]);

  return (
    <div className="min-w-0 max-w-full space-y-3 px-1 py-1 md:px-1.5 md:py-1.5">
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <span className="px-3 py-1.5 text-sm font-semibold text-slate-700">开播记录</span>
        <span className="text-xs text-slate-400">主播开播 / 下播实时记录（与排班并存）</span>
      </div>
      <CheckinHistoryClient
        initialData={data}
        initialDate={date}
        initialProduct={product ?? ""}
        canForceEnd={canForceEnd}
      />
    </div>
  );
}
