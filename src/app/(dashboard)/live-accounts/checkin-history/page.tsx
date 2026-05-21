import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCheckinDay } from "@/modules/checkin/queries";
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
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login?next=/live-accounts/checkin-history");

  const sp = await searchParams;
  const date = sp.date ?? toLocalIsoDate(new Date());
  const product = sp.product ?? undefined;

  const data = await getCheckinDay(date, product);

  return (
    <div className="min-w-0 max-w-full space-y-3 px-1 py-1 md:px-1.5 md:py-1.5">
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <span className="px-3 py-1.5 text-sm font-semibold text-slate-700">开播记录</span>
        <span className="text-xs text-slate-400">主播开播 / 下播实时记录（与排班并存）</span>
      </div>
      <CheckinHistoryClient initialData={data} initialDate={date} initialProduct={product ?? ""} />
    </div>
  );
}
