import { auth } from "@/lib/auth";
import { resolveDingtalkIdentityByAuthUserId } from "@/lib/auth/dingtalk-identity";
import { db } from "@/db/client";
import { auth_user, dingtalk_user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardShell } from "./_components/shell";
import { resolveVisibleModules } from "@/modules/permissions/server";
import type { ModuleKey } from "@/modules/permissions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  // 读 cookie 决定 sidebar 默认折叠态（避免 SSR 闪烁）
  const cookieStore = await cookies();
  const defaultCollapsed = cookieStore.get("sidebar-collapsed")?.value === "true";

  // 取用户岗位（钉钉员工 / 外部邀请码 / 应急后门 三类）
  let userTitle: string | null;
  let userName = session.user.name;
  // sidebar 可见 module 集合
  let visibleModuleIds: string[] = [];
  let isEmergency = false;

  if (session.user.email === "emergency@qjhy.local") {
    userTitle = "超级管理员";
    isEmergency = true;
  } else {
    // 查 auth_user 看是哪一类 + 是否已禁用/过期
    const [u] = await db
      .select({
        isExternal: auth_user.isExternal,
        isActive: auth_user.isActive,
        expireAt: auth_user.expireAt,
      })
      .from(auth_user)
      .where(eq(auth_user.id, session.user.id));

    if (!u || !u.isActive) redirect("/login");
    if (u.expireAt && u.expireAt.getTime() < Date.now()) redirect("/login");

    if (u.isExternal) {
      // 外部用户：从 dingtalk_user 影子条目拿 name + 算 visible modules
      const [ext] = await db
        .select({ user_id: dingtalk_user.user_id, name: dingtalk_user.name })
        .from(dingtalk_user)
        .where(eq(dingtalk_user.auth_user_id, session.user.id));
      if (ext?.name) userName = ext.name;
      userTitle = "外部用户";
      if (ext?.user_id) {
        visibleModuleIds = [...(await resolveVisibleModules(ext.user_id))];
      }
    } else {
      // 钉钉用户：走 unionid 链路
      const identity = await resolveDingtalkIdentityByAuthUserId(session.user.id);
      if (identity.kind !== "ok") {
        return (
          <main className="flex min-h-screen items-center justify-center bg-[var(--bg-page)] px-6">
            <div className="max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h1 className="text-lg font-semibold">账号未开通</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                当前钉钉账号不在本企业通讯录或已离职，暂时不能访问系统。
              </p>
              {identity.dingtalkUnionId && (
                <p className="mt-3 text-xs text-muted-foreground">
                  UnionID: <code>{identity.dingtalkUnionId}</code>
                </p>
              )}
            </div>
          </main>
        );
      }
      userTitle = identity.title;
      visibleModuleIds = [...(await resolveVisibleModules(identity.dingtalkUserId))];
    }
  }

  return (
    <DashboardShell
      defaultCollapsed={defaultCollapsed}
      userName={userName}
      userTitle={userTitle}
      visibleModules={visibleModuleIds as ModuleKey[]}
      bypassPerms={isEmergency}
    >
      {children}
    </DashboardShell>
  );
}
