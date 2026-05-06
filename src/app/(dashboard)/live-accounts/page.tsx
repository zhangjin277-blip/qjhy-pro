import { db } from "@/db/client";
import { dingtalk_user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { listAccounts } from "@/modules/live-account/server";
import { listAnchors } from "@/modules/live-anchor/server";
import { listBindings } from "@/modules/live-anchor/account-bindings";
import { listRooms } from "@/modules/live-room/server";
import { Product } from "@/modules/live-account";
import { AccountListClient } from "./_components/account-list-client";

const PRODUCTS = Product.options;
const DEFAULT_PRODUCT = PRODUCTS[0] ?? "捕鱼大作战";

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
  const [accounts, allBindings, rooms, allAnchors, activeUsers] = await Promise.all([
    listAccounts({ product: selectedProduct }),
    listBindings({}),
    listRooms(),
    listAnchors({}),
    db
      .select({
        user_id: dingtalk_user.user_id,
        name: dingtalk_user.name,
        active: dingtalk_user.active,
      })
      .from(dingtalk_user)
      .where(eq(dingtalk_user.active, true))
      .orderBy(dingtalk_user.name),
  ]);

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
          active: u.active,
        }))}
        anchors={anchors}
      />
    </div>
  );
}
