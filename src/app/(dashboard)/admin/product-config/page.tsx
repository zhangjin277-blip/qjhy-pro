import { redirect } from "next/navigation";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import { listProducts } from "@/modules/product-config/server";
import { ProductConfigClient } from "./_components/product-config-client";

export default async function ProductConfigPage() {
  const currentUser = await getCurrentDingtalkUser();
  if (currentUser.kind === "unauth") redirect("/login");
  if (currentUser.kind === "user_not_synced") redirect("/");

  // 应急用户直接放行；钉钉用户需 permissions.can_admin
  if (!currentUser.isEmergency) {
    const perm = await resolvePermission(currentUser.dingtalkUserId, "permissions");
    if (!perm.can_admin) redirect("/");
  }

  const products = await listProducts();
  return (
    <div className="min-w-0 max-w-full space-y-3 px-1 py-1 md:px-1.5 md:py-1.5">
      <div className="flex items-center gap-1 border-b border-slate-200 pb-1">
        <span className="mr-2 px-3 py-1.5 text-sm font-semibold text-slate-700">产品分类配置</span>
      </div>
      <p className="text-sm text-muted-foreground">管理产品分类的名称、简称和主色。</p>
      <ProductConfigClient initial={products} />
    </div>
  );
}
