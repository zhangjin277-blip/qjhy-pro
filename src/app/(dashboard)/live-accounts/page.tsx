import { db } from "@/db/client";
import { dingtalk_user, anchor_profile, live_account } from "@/db/schema";
import { schedule_override } from "@/db/schema/schedule-override";
import { and, eq, inArray, sql } from "drizzle-orm";
import { listAccounts } from "@/modules/live-account/server";
import { listAnchors } from "@/modules/live-anchor/server";
import { listBindings } from "@/modules/live-anchor";
import { listRooms } from "@/modules/live-room/server";
import { Product } from "@/modules/live-account";
import { AccountListClient } from "./_components/account-list-client";
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
  const sp = await searchParams;
  const selectedProduct = PRODUCTS.includes(sp.product as (typeof PRODUCTS)[number])
    ? (sp.product as string)
    : DEFAULT_PRODUCT;

  // Parallel fetch
  const [accounts, allBindings, rooms, allAnchors, activeUsers, douyinAvatars] = await Promise.all([
    listAccounts({ product: selectedProduct }),
    listBindings({}),
    listRooms(),
    listAnchors({}),
    // 仅直播一部下、在职的钉钉用户（运营 select 候选）
    db
      .select({
        user_id: dingtalk_user.user_id,
        name: dingtalk_user.name,
        title: dingtalk_user.title,
        active: dingtalk_user.active,
      })
      .from(dingtalk_user)
      .where(
        and(
          eq(dingtalk_user.active, true),
          sql`${dingtalk_user.dept_ids} @> ${JSON.stringify([LIVE_DEPT_ID])}::jsonb`,
        ),
      )
      .orderBy(dingtalk_user.name),
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
  ]);

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

  // Compute per-product counts
  const productCounts: Record<string, number> = {};
  for (const p of PRODUCTS) {
    const list = await listAccounts({ product: p });
    productCounts[p] = list.length;
  }

  // Anchor list for binding form
  const anchors = allAnchors.map((a) => ({
    dingtalk_user_id: a.dingtalk_user_id,
    name: a.name,
  }));

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">直播账号</h1>
        <div className="text-sm text-slate-500">
          共 {productCounts[selectedProduct] ?? 0} 个账号 · {selectedProduct}
        </div>
      </div>
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
      />
    </div>
  );
}
