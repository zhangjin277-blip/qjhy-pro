import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { dingtalk_user } from "@/db/schema";
import { resolvePermission } from "@/modules/permissions/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import {
  MODULE_KEYS,
  MODULE_LABEL,
  type ModuleKey,
  type ResolvedPermission,
  type Scope,
} from "@/modules/permissions";

const SCOPE_LABEL: Record<Scope, string> = {
  none: "无权限",
  self: "仅本人",
  team: "本部门",
  all: "全部",
};

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

  const perms: Record<ModuleKey, ResolvedPermission> = {} as Record<ModuleKey, ResolvedPermission>;
  for (const m of MODULE_KEYS) {
    perms[m] = await resolvePermission(dingUser.user_id, m);
  }
  const sourceSet = new Set<string>();
  for (const m of MODULE_KEYS) {
    for (const s of perms[m].sources) sourceSet.add(s.kind);
  }

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
          <CardTitle>各板块权限</CardTitle>
          <CardDescription>
            每个业务板块独立计算（岗位默认 + 部门负责人 + 个体覆盖）
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left py-2 pr-4">板块</th>
                <th className="text-left py-2 pr-4">数据范围</th>
                <th className="text-left py-2 pr-4">编辑</th>
                <th className="text-left py-2 pr-4">导出</th>
                <th className="text-left py-2">管理</th>
              </tr>
            </thead>
            <tbody>
              {MODULE_KEYS.map((m) => {
                const p = perms[m];
                return (
                  <tr key={m} className="border-b last:border-b-0">
                    <td className="py-2 pr-4 font-medium">{MODULE_LABEL[m]}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={p.scope === "none" ? "text-muted-foreground" : "text-primary"}
                      >
                        {SCOPE_LABEL[p.scope]}
                      </span>
                    </td>
                    <td className="py-2 pr-4">{p.can_edit ? "✓" : "✗"}</td>
                    <td className="py-2 pr-4">{p.can_export ? "✓" : "✗"}</td>
                    <td className="py-2">{p.can_admin ? "✓" : "✗"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="text-xs text-muted-foreground pt-3">
            权限来源：{sourceSet.size === 0 ? "无" : Array.from(sourceSet).join(" + ")}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
