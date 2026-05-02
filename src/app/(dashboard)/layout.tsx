import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { dingtalk_user } from "@/db/schema";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { DashboardShell } from "./_components/shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  // 读 cookie 决定 sidebar 默认折叠态（避免 SSR 闪烁）
  const cookieStore = await cookies();
  const defaultCollapsed = cookieStore.get("sidebar-collapsed")?.value === "true";

  // 取用户岗位（钉钉同步用户从 dingtalk_user 拿 title；应急用户回落"超级管理员"）
  let userTitle: string | null;
  if (session.user.email === "emergency@qjhy.local") {
    userTitle = "超级管理员";
  } else {
    const [du] = await db
      .select({ title: dingtalk_user.title })
      .from(dingtalk_user)
      .where(eq(dingtalk_user.unionid, session.user.id));
    userTitle = du?.title ?? null;
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
