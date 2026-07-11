import { redirect } from "next/navigation";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { getFloorPlanData } from "@/modules/live-room/server";
import { buildFloorPlanView } from "@/modules/live-room";
import { FloorPlanBoard } from "@/app/(dashboard)/live-accounts/floor-plan/_components/floor-plan-board";

export const metadata = { title: "直播间平面图 · 大屏" };

/**
 * 值班大屏模式（餐厅电视挂墙）：无侧边栏、整体放大、每分钟自动刷新。
 * 电视浏览器登录一次后长期展示；zoom 适配 1080p/4K 电视。
 */
export default async function FloorPlanTvPage() {
  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind === "unauth") redirect("/login?next=/floor-plan-tv");
  if (ctx.kind === "user_not_synced") {
    return (
      <div className="p-6 text-sm text-red-600">
        当前账号尚未同步到钉钉用户表，无法计算权限。请联系管理员。
      </div>
    );
  }

  const data = await getFloorPlanData(ctx.dingtalkUserId, ctx.isEmergency);
  if (!data) {
    return <div className="p-6 text-sm text-slate-500">没有直播账号板块的查看权限。</div>;
  }

  const view = buildFloorPlanView(data);

  return (
    <div className="min-h-screen bg-[#F7F8FA] px-4 py-3" style={{ zoom: 1.25 }}>
      <FloorPlanBoard
        sections={view.sections}
        stats={view.stats}
        unmapped={view.unmapped}
        generatedAtHHmm={view.generatedAtHHmm}
        tv
      />
    </div>
  );
}
