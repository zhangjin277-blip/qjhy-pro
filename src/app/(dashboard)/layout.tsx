import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="bg-muted/20 min-h-screen">
      <header className="bg-background border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold">QJHY-Pro</h1>
          <nav className="flex gap-4 text-sm">
            <a href="/dashboard" className="text-muted-foreground hover:text-primary">
              仪表盘
            </a>
            <a href="/admin/permissions" className="text-muted-foreground hover:text-primary">
              权限管理
            </a>
            <a href="/profile" className="text-muted-foreground hover:text-primary">
              我的权限
            </a>
          </nav>
          <div className="text-muted-foreground text-sm">
            {session.user.name}
            <form action="/api/auth/sign-out" method="POST" className="ml-4 inline">
              <button type="submit" className="text-primary hover:underline">
                退出
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-screen-2xl px-6 py-6">{children}</main>
    </div>
  );
}
