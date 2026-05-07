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
