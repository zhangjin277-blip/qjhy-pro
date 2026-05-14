import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import { redirect } from "next/navigation";
import { PermissionsTabs } from "./_components/tabs";

export default async function PermissionsAdminPage() {
  const currentUser = await getCurrentDingtalkUser();
  if (currentUser.kind === "unauth") redirect("/login");

  // 应急用户直接 admin
  if (currentUser.kind === "ok" && currentUser.isEmergency) {
    return renderAdminPage();
  }

  // 钉钉用户：auth_user.id → auth_account.unionId → 本企业 dingtalk_user.user_id → 查权限
  if (currentUser.kind === "user_not_synced") {
    return (
      <div className="max-w-2xl p-8">
        <h2 className="text-xl font-semibold">权限不足</h2>
        <p className="text-muted-foreground mt-2">
          当前钉钉账号不在本企业通讯录或已离职
          {currentUser.dingtalkUnionId ? (
            <>
              （unionId: <code>{currentUser.dingtalkUnionId}</code>）
            </>
          ) : null}
          ，无法进入权限系统。
        </p>
      </div>
    );
  }

  const perm = await resolvePermission(currentUser.dingtalkUserId, "permissions");
  if (!perm.can_admin) {
    return (
      <div className="max-w-2xl p-8">
        <h2 className="text-xl font-semibold">权限不足</h2>
        <p className="text-muted-foreground mt-2">
          需要管理员权限。当前权限来源：{perm.sources.map((s) => s.kind).join(" + ")}
        </p>
      </div>
    );
  }

  return renderAdminPage();
}

function renderAdminPage() {
  return (
    <div className="min-w-0 max-w-full space-y-3 px-1 py-1 md:px-1.5 md:py-1.5">
      <div className="flex items-center gap-1 border-b border-slate-200 pb-1">
        <span className="mr-2 px-3 py-1.5 text-sm font-semibold text-slate-700">权限管理</span>
      </div>
      <p className="text-muted-foreground text-sm">统一管理用户权限、岗位默认权限和审计日志。</p>
      <PermissionsTabs />
    </div>
  );
}
