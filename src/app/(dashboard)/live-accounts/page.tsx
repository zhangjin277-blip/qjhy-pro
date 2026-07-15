import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { dingtalk_user, anchor_profile, live_account } from "@/db/schema";
import { schedule_override } from "@/db/schema/schedule-override";
import { and, eq, inArray, sql } from "drizzle-orm";
import { listAccounts, listPendingDeleteRequests } from "@/modules/live-account/server";
import { listAnchors } from "@/modules/live-anchor/server";
import { listBindings } from "@/modules/live-anchor";
import { listRooms } from "@/modules/live-room/server";
import { Product } from "@/modules/live-account";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import { AccountListClient } from "./_components/account-list-client";
import { DeleteRequestBanner, type DeleteRequestItem } from "./_components/delete-request-banner";
import type { OverrideRowView } from "./_components/schedule-override-tab";

const PRODUCTS = Product.options;
const DEFAULT_PRODUCT = PRODUCTS[0] ?? "捕鱼大作战";

// 直播一部部门 ID — 钉钉权威源
const LIVE_DEPT_ID = "724640467";

export default async function LiveAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
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

  // 删除审核：live_account 管理员可见待审申请横幅
  const canAdmin = isEmergency
    ? true
    : (await resolvePermission(dingtalkUserId, "live_account")).points.has("delete_review");
  const pendingDeleteRequests: DeleteRequestItem[] = canAdmin
    ? (await listPendingDeleteRequests()).map((r) => ({
        id: r.id,
        account_name: r.account_name,
        product: r.product,
        reason: r.reason,
        impact: r.impact,
        requested_by_name: r.requested_by_name ?? "(未知)",
        requested_at: r.requested_at.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
      }))
    : [];

  const sp = await searchParams;
  const selectedProduct = PRODUCTS.includes(sp.product as (typeof PRODUCTS)[number])
    ? (sp.product as string)
    : DEFAULT_PRODUCT;

  // Parallel fetch
  const [accounts, allBindings, rooms, allAnchors, activeUsers, douyinAvatars, placementLabelRows] =
    await Promise.all([
      listAccounts({ product: selectedProduct }, dingtalkUserId, isEmergency),
      listBindings({}),
      listRooms(dingtalkUserId, isEmergency),
      // 排班下拉只取 (id, name)，不分 scope（运营要给账号挑主播，必须看全表）
      listAnchors({}),
      // 直播一部 + 所有子部门下、在职的钉钉用户（运营 select 候选）
      // 递归 CTE 展开 dept_id 树，再用 dept_ids ?| 命中
      db.execute<{ user_id: string; name: string; title: string | null; active: boolean }>(sql`
        WITH RECURSIVE dept_tree AS (
          SELECT dept_id FROM dingtalk_dept WHERE dept_id = ${LIVE_DEPT_ID}
          UNION ALL
          SELECT d.dept_id FROM dingtalk_dept d JOIN dept_tree t ON d.parent_id = t.dept_id
        )
        SELECT user_id, name, title, active
        FROM dingtalk_user
        WHERE active = true
          AND dept_ids ?| ARRAY(SELECT dept_id FROM dept_tree)
        ORDER BY name
      `),
      // 抖音账号 → anchor_profile.avatar 反向 join（仅当前 product 的）
      db
        .select({
          platform_account_id: live_account.platform_account_id,
          avatar: anchor_profile.avatar,
        })
        .from(live_account)
        .leftJoin(
          anchor_profile,
          eq(live_account.platform_account_id, anchor_profile.aweme_display_id),
        )
        .where(and(eq(live_account.platform, "抖音"), eq(live_account.product, selectedProduct))),
      // 全部 distinct placement_label 供编辑下拉选
      db
        .selectDistinct({ placement_label: live_account.placement_label })
        .from(live_account)
        .where(sql`${live_account.placement_label} IS NOT NULL`)
        .orderBy(live_account.placement_label),
    ]);
  const placementLabelOptions = (placementLabelRows as { placement_label: string | null }[])
    .map((r) => r.placement_label)
    .filter((l): l is string => !!l);

  // 抖音账号 platform_account_id → avatar URL
  const avatarByPlatformId: Record<string, string | null> = {};
  for (const r of douyinAvatars) {
    if (r.platform_account_id) avatarByPlatformId[r.platform_account_id] = r.avatar;
  }

  // Group bindings by account_id
  const bindingsByAccount: Record<
    string,
    {
      id: string;
      account_id: string | null;
      dingtalk_user_id: string;
      anchor_name: string | null;
      time_slots: [string, string][];
      rest_days: number[];
      remark: string | null;
    }[]
  > = {};
  for (const b of allBindings) {
    if (!b.account_id) continue;
    if (!bindingsByAccount[b.account_id]) bindingsByAccount[b.account_id] = [];
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    bindingsByAccount[b.account_id]!.push({
      id: b.id,
      account_id: b.account_id,
      dingtalk_user_id: b.dingtalk_user_id,
      anchor_name: b.anchor_name,
      time_slots: b.time_slots as [string, string][],
      rest_days: b.rest_days,
      remark: b.remark,
    });
  }

  // Bulk fetch all schedule_override rows for all accounts (single IN query)
  const allOverrides: OverrideRowView[] =
    accounts.length > 0
      ? (
          await db
            .select({
              id: schedule_override.id,
              account_id: schedule_override.account_id,
              date: schedule_override.date,
              dingtalk_user_id: schedule_override.dingtalk_user_id,
              anchor_name: dingtalk_user.name,
              time_slots: schedule_override.time_slots,
              reason: schedule_override.reason,
            })
            .from(schedule_override)
            .leftJoin(dingtalk_user, eq(schedule_override.dingtalk_user_id, dingtalk_user.user_id))
            .where(
              inArray(
                schedule_override.account_id,
                accounts.map((a) => a.id),
              ),
            )
            .orderBy(schedule_override.date)
        ).map((r) => ({
          ...r,
          time_slots: r.time_slots as [string, string][],
        }))
      : [];

  // Group by account_id → plain Record so it can cross the server→client boundary
  const overridesByAccount: Record<string, OverrideRowView[]> = {};
  for (const o of allOverrides) {
    if (!overridesByAccount[o.account_id]) overridesByAccount[o.account_id] = [];
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    overridesByAccount[o.account_id]!.push(o);
  }

  // Compute per-product counts（按当前用户 scope 算计数）
  const productCounts: Record<string, number> = {};
  for (const p of PRODUCTS) {
    const list = await listAccounts({ product: p }, dingtalkUserId, isEmergency);
    productCounts[p] = list.length;
  }

  // Anchor list for binding form：合并两个来源 + 按 user_id 去重
  // 1. live_anchor 表（已建档的主播）
  // 2. 钉钉主播部门成员（合作主播 + 运营 三套子部门，新主播没建档也能选）
  const anchorDeptIds = ["728935814", "928732653", "929188023", "932021044"];
  const dingtalkAnchors = await db.execute<{ user_id: string; name: string }>(sql`
    SELECT user_id, name FROM dingtalk_user
    WHERE active = true
      AND dept_ids ?| ARRAY[${sql.raw(anchorDeptIds.map((d) => `'${d}'`).join(","))}]::text[]
    ORDER BY name
  `);
  const anchorMap = new Map<string, { dingtalk_user_id: string; name: string }>();
  for (const a of allAnchors) {
    anchorMap.set(a.dingtalk_user_id, { dingtalk_user_id: a.dingtalk_user_id, name: a.name });
  }
  for (const u of dingtalkAnchors) {
    if (!anchorMap.has(u.user_id)) {
      anchorMap.set(u.user_id, { dingtalk_user_id: u.user_id, name: u.name });
    }
  }
  const anchors = [...anchorMap.values()].sort((a, b) => a.name.localeCompare(b.name, "zh"));

  return (
    <div className="min-w-0 max-w-full space-y-3 px-1 py-1 md:px-1.5 md:py-1.5">
      <div className="flex items-center gap-1 border-b border-slate-200 pb-1">
        <span className="mr-2 px-3 py-1.5 text-sm font-semibold text-slate-700">直播账号</span>
        <div className="ml-auto px-3 text-sm text-slate-500">
          共 {productCounts[selectedProduct] ?? 0} 个账号 · {selectedProduct}
        </div>
      </div>
      {pendingDeleteRequests.length > 0 && <DeleteRequestBanner requests={pendingDeleteRequests} />}
      <AccountListClient
        initialAccounts={accounts}
        bindingsByAccount={bindingsByAccount}
        productCounts={productCounts}
        selectedProduct={selectedProduct}
        rooms={rooms.map((r) => ({ id: r.id, room_no: r.room_no }))}
        dingtalkUsers={activeUsers.map((u) => ({
          user_id: u.user_id,
          name: u.name,
          title: u.title,
          active: u.active,
        }))}
        anchors={anchors}
        avatarByPlatformId={avatarByPlatformId}
        overridesByAccount={overridesByAccount}
        placementLabelOptions={placementLabelOptions}
      />
    </div>
  );
}
