import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Dashboard</h2>
      <Card>
        <CardHeader>
          <CardTitle>Phase 0 占位首页</CardTitle>
          <CardDescription>
            欢迎，{session?.user.name}。本页将在 Phase 1 加入“我是谁、我的权限”模块。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            User ID: <code>{session?.user.id}</code>
          </p>
          <p className="text-muted-foreground text-sm">
            Email: <code>{session?.user.email}</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
