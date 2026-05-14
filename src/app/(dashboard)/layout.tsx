import { auth } from "@/lib/auth";
import { resolveDingtalkIdentityByAuthUserId } from "@/lib/auth/dingtalk-identity";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardShell } from "./_components/shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  // 读 cookie 决定 sidebar 默认折叠态（避免 SSR 闪烁）
  const cookieStore = await cookies();
  const defaultCollapsed = cookieStore.get("sidebar-collapsed")?.value === "true";

  // 取用户岗位（钉钉同步用户从本企业 dingtalk_user 拿 title；应急用户回落"超级管理员"）
  let userTitle: string | null;
  if (session.user.email === "emergency@qjhy.local") {
    userTitle = "超级管理员";
  } else {
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
  }

  return (
    <DashboardShell
      defaultCollapsed={defaultCollapsed}
      userName={session.user.name}
      userTitle={userTitle}
    >
      {children}
    </DashboardShell>
  );
}
