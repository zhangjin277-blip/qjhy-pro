import { redirect } from "next/navigation";
import { listAnchors } from "@/modules/live-anchor/server";
import { listBindings } from "@/modules/live-anchor";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";
import { AnchorListClient } from "./_components/anchor-list-client";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";

const LIVE_DEPT_ID = "724640467";

interface DeptUserRow {
  user_id: string;
  name: string;
  title: string | null;
  active: boolean;
}

export default async function LiveAnchorsPage() {
  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind === "unauth") redirect("/login");
  if (ctx.kind === "user_not_synced") {
    return (
      <div className="p-6 text-sm text-red-600">
        当前账号尚未同步到钉钉用户表，无法计算权限。请联系管理员。
      </div>
    );
  }
  const { dingtalkUserId, isEmergency } = ctx;

  const [anchors, allBindings, deptUsers] = await Promise.all([
    listAnchors({}, dingtalkUserId, isEmergency),
    listBindings({}),
    // 直播一部及全部子部门（合作主播/运营/后期/...）下的钉钉用户，用于"添加新主播"下拉
    db.execute(sql`
      WITH RECURSIVE tree AS (
        SELECT dept_id FROM dingtalk_dept WHERE dept_id = ${LIVE_DEPT_ID}
        UNION ALL
        SELECT d.dept_id FROM dingtalk_dept d JOIN tree t ON d.parent_id = t.dept_id
      )
      SELECT user_id, name, title, active
      FROM dingtalk_user
      WHERE dept_ids ?| (SELECT array_agg(dept_id) FROM tree)
      ORDER BY name
    `) as unknown as Promise<DeptUserRow[]>,
  ]);

  // 分组 bindings by anchor (dingtalk_user_id)
  const bindingsByAnchor: Record<string, typeof allBindings> = {};
  for (const b of allBindings) {
    if (b.account_deprecated_at) continue; // 已废弃账号的绑定不再展示
    if (!bindingsByAnchor[b.dingtalk_user_id]) bindingsByAnchor[b.dingtalk_user_id] = [];
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    bindingsByAnchor[b.dingtalk_user_id]!.push(b);
  }

  return (
    <div className="min-w-0 max-w-full space-y-3 px-1 py-1 md:px-1.5 md:py-1.5">
      <div className="flex items-center gap-1 border-b border-slate-200 pb-1">
        <span className="mr-2 px-3 py-1.5 text-sm font-semibold text-slate-700">主播档案</span>
        <div className="ml-auto px-3 text-sm text-slate-500">共 {anchors.length} 位主播</div>
      </div>
      <AnchorListClient
        initialAnchors={anchors}
        bindingsByAnchor={bindingsByAnchor}
        deptUsers={deptUsers}
      />
    </div>
  );
}
