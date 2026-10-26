import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { listProcurement, procurementStats } from "@/modules/procurement";
import { ProcurementClient } from "./procurement-client";
export const dynamic = "force-dynamic";
export default async function ProcurementPage() {
  try {
    const [items, stats] = await Promise.all([listProcurement(), procurementStats()]);
    const session = await auth.api.getSession({ headers: await headers() });
    return (
      <ProcurementClient
        initialItems={items}
        initialStats={stats}
        currentUserName={session?.user.name ?? ""}
      />
    );
  } catch (error) {
    console.error("[procurement-page]", error);
    return (
      <ModuleUnavailable
        title="道具采购"
        detail="采购模块暂时无法加载，请确认数据库迁移 0076 已执行。"
      />
    );
  }
}

function ModuleUnavailable({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="p-6">
      <div className="max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h1 className="text-xl font-semibold text-amber-950">{title}</h1>
        <p className="mt-2 text-sm text-amber-900">{detail}</p>
        <p className="mt-3 text-xs text-amber-800">
          当前地址已进入正确页面，刷新或完成迁移后即可继续使用。
        </p>
      </div>
    </main>
  );
}
