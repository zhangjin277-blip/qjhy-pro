import { listAnchors } from "@/modules/live-anchor/server";
import { listBindings } from "@/modules/live-anchor";
import { db } from "@/db/client";
import { dingtalk_user } from "@/db/schema";
import { sql } from "drizzle-orm";
import { AnchorListClient } from "./_components/anchor-list-client";

const LIVE_DEPT_ID = "724640467";

export default async function LiveAnchorsPage() {
  const [anchors, allBindings, deptUsers] = await Promise.all([
    listAnchors({}),
    listBindings({}),
    // 直播一部下所有钉钉用户（含离职），用于"添加新主播"下拉
    db
      .select({
        user_id: dingtalk_user.user_id,
        name: dingtalk_user.name,
        title: dingtalk_user.title,
        active: dingtalk_user.active,
      })
      .from(dingtalk_user)
      .where(sql`${dingtalk_user.dept_ids} @> ${JSON.stringify([LIVE_DEPT_ID])}::jsonb`)
      .orderBy(dingtalk_user.name),
  ]);

  // 分组 bindings by anchor (dingtalk_user_id)
  const bindingsByAnchor: Record<string, typeof allBindings> = {};
  for (const b of allBindings) {
    if (!bindingsByAnchor[b.dingtalk_user_id]) bindingsByAnchor[b.dingtalk_user_id] = [];
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    bindingsByAnchor[b.dingtalk_user_id]!.push(b);
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">主播档案</h1>
        <div className="text-sm text-slate-500">共 {anchors.length} 位主播</div>
      </div>
      <AnchorListClient
        initialAnchors={anchors}
        bindingsByAnchor={bindingsByAnchor}
        deptUsers={deptUsers}
      />
    </div>
  );
}
