import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { dingtalk_user } from "@/db/schema";
import { resolvePermission } from "@/modules/permissions/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

export default async function ProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  // 应急用户走特殊分支
  if (session.user.email === "emergency@qjhy.local") {
    return (
      <div className="space-y-4 max-w-2xl">
        <h2 className="text-2xl font-bold">我的权限</h2>
        <Card>
          <CardHeader>
            <CardTitle>应急后门用户</CardTitle>
            <CardDescription>不在钉钉同步范围内</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>姓名：{session.user.name}</div>
            <div>Email：{session.user.email}</div>
            <div>
              权限：<strong className="text-primary">超级管理员</strong>（绕过常规权限）
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 钉钉登录用户：unionid → dingtalk_user.user_id
  const [dingUser] = await db
    .select()
    .from(dingtalk_user)
    .where(eq(dingtalk_user.unionid, session.user.id));

  if (!dingUser) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h2 className="text-2xl font-bold">我的权限</h2>
        <Card>
          <CardHeader>
            <CardTitle>等待同步</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p>当前用户尚未同步到组织架构表。</p>
            <p className="mt-2 text-muted-foreground">
              UnionID: <code>{session.user.id}</code>
            </p>
            <p className="mt-2 text-muted-foreground">
              钉钉同步每天凌晨 02:00 自动跑。如需立即生效，请联系管理员手动触发。
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const perm = await resolvePermission(dingUser.user_id);

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-2xl font-bold">我的权限</h2>

      <Card>
        <CardHeader>
          <CardTitle>基本信息</CardTitle>
          <CardDescription>来自钉钉同步</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>姓名：{dingUser.name}</div>
          <div>
            钉钉岗位：
            {dingUser.title ?? <span className="text-muted-foreground">未填岗位</span>}
          </div>
          <div>
            所属部门 ID：{dingUser.dept_ids.length > 0 ? dingUser.dept_ids.join(", ") : "-"}
          </div>
          <div className="text-xs text-muted-foreground pt-2">
            UnionID: <code>{dingUser.unionid}</code>
          </div>
          <div className="text-xs text-muted-foreground">
            UserID: <code>{dingUser.user_id}</code>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>当前权限</CardTitle>
          <CardDescription>三层叠加计算结果</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="rounded-lg bg-primary/10 border border-primary/20 p-3">
            <div>
              数据范围：
              <strong className="text-primary font-mono text-base">{perm.scope}</strong>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
              <div>可编辑：{perm.can_edit ? "✓" : "✗"}</div>
              <div>可导出：{perm.can_export ? "✓" : "✗"}</div>
              <div>可管理：{perm.can_admin ? "✓" : "✗"}</div>
            </div>
          </div>

          <div className="text-muted-foreground">
            <div className="font-medium text-foreground mb-1">权限来源</div>
            {perm.sources.length === 0 ? (
              <p>无</p>
            ) : (
              <ul className="list-disc pl-5 space-y-1">
                {perm.sources.map((s, i) => {
                  if (s.kind === "default") {
                    return <li key={i}>岗位默认（{s.position}）</li>;
                  }
                  if (s.kind === "dept_leader") {
                    return (
                      <li key={i}>
                        部门负责人（管理 {s.deptIds.length} 个部门：
                        {s.deptIds.join(", ")}）
                      </li>
                    );
                  }
                  if (s.kind === "override") {
                    return (
                      <li key={i}>
                        个体覆盖（理由：{s.reason}
                        {s.expires_at
                          ? `，过期：${new Date(s.expires_at).toLocaleString("zh-CN")}`
                          : ""}
                        ）
                      </li>
                    );
                  }
                  return null;
                })}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
