import { redirect } from "next/navigation";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { getFloorPlanData } from "@/modules/live-room/server";
import { buildFloorPlanView } from "@/modules/live-room";
import { FloorPlanBoard } from "./_components/floor-plan-board";

export default async function FloorPlanPage() {
  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind === "unauth") redirect("/login");
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
    <FloorPlanBoard
      sections={view.sections}
      stats={view.stats}
      unmapped={view.unmapped}
      generatedAtHHmm={view.generatedAtHHmm}
    />
  );
}
