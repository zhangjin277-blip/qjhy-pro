import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { dingtalk_user } from "@/db/schema";
import { resolvePermission } from "@/modules/permissions/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { PermissionsTabs } from "./_components/tabs";

export default async function PermissionsAdminPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  // 应急用户直接 admin
  if (session.user.email === "emergency@qjhy.local") {
    return renderAdminPage();
  }

  // 钉钉用户：unionid → dingtalk_user.user_id → 查权限
  const [du] = await db
    .select({ user_id: dingtalk_user.user_id })
    .from(dingtalk_user)
    .where(eq(dingtalk_user.unionid, session.user.id));

  if (!du) {
    return (
      <div className="max-w-2xl p-8">
        <h2 className="text-xl font-semibold">权限不足</h2>
        <p className="text-muted-foreground mt-2">
          当前用户尚未同步到组织架构表（unionid: <code>{session.user.id}</code>
          ）。 请等待下一次钉钉同步（每天 02:00），或让管理员手动触发。
        </p>
      </div>
    );
  }

  const perm = await resolvePermission(du.user_id, "permissions");
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
