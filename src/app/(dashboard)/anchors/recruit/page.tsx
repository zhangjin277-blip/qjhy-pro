import { redirect } from "next/navigation";

import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { listRecruitmentBoard, listRecruitmentCenter } from "@/modules/business-recruitment/server";
import { resolvePermission } from "@/modules/permissions/server";
import { listProducts } from "@/modules/product-config/server";

import { RecruitmentCenterClient } from "./_components/recruitment-center-client";

export default async function BusinessRecruitmentPage() {
  const identity = await getCurrentDingtalkUser();
  if (identity.kind === "unauth") redirect("/login");
  if (identity.kind === "user_not_synced") {
    return <div className="p-8 text-sm text-muted-foreground">当前钉钉账号未同步。</div>;
  }
  if (!identity.isEmergency) {
    const permission = await resolvePermission(identity.dingtalkUserId, "business_recruitment");
    if (permission.scope === "none" && permission.points.size === 0) {
      return <div className="p-8 text-sm text-muted-foreground">暂无线上招募板块权限。</div>;
    }
  }

  const [center, board, products] = await Promise.all([
    listRecruitmentCenter(),
    listRecruitmentBoard(),
    listProducts(),
  ]);
  return (
    <div className="min-w-0 max-w-full space-y-3 px-1 py-1 md:px-1.5 md:py-1.5">
      <div className="flex items-center gap-1 border-b border-slate-200 pb-1">
        <span className="mr-2 px-3 py-1.5 text-sm font-semibold text-slate-700">招聘中心</span>
      </div>
      <RecruitmentCenterClient
        initialCenter={center}
        initialBoard={board}
        products={products.map((product) => product.productName)}
      />
    </div>
  );
}
