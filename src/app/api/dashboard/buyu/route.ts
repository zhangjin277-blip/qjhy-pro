import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { resolvePlacementScope, type PlacementScope } from "@/modules/placement/server";

const PRODUCTS = [
  { id: "product_buyu", label: "3D" },
  { id: "product_ue4", label: "UE4" },
  { id: "product_urp", label: "URP" },
] as const;

type ProductId = (typeof PRODUCTS)[number]["id"];

export interface BuyuProductSummary {
  dataset_id: ProductId;
  label: string;
  cost: number;
  activations: number;
  payment: number;
  roi: number;
  prev: { cost: number; activations: number; payment: number; roi: number };
  daily: { date: string; cost: number; activations: number; payment: number }[];
  accounts: {
    account_id: string;
    account_name: string;
    cost: number;
    activations: number;
    payment: number;
    cpi: number | null;
    realtime_roi: number | null;
  }[];
}

export interface BuyuDashboardResponse {
  date_from: string;
  date_to: string;
  products: BuyuProductSummary[];
}

function scopeClause(scope: PlacementScope) {
  if (scope.kind === "all") return sql``;
  if (scope.kind === "reject" || scope.ids.length === 0) return sql`AND FALSE`;
  return sql`AND a.agent_dingtalk_user_id = ANY(ARRAY[${sql.join(
    scope.ids.map((id) => sql`${id}`),
    sql`, `,
  )}]::text[])`;
}

function periodStart(dateFrom: string, dateTo: string): string {
  const from = new Date(`${dateFrom}T00:00:00Z`);
  const to = new Date(`${dateTo}T00:00:00Z`);
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
  from.setUTCDate(from.getUTCDate() - days);
  return from.toISOString().slice(0, 10);
}

function emptyProduct(datasetId: ProductId, label: string): BuyuProductSummary {
  return {
    dataset_id: datasetId,
    label,
    cost: 0,
    activations: 0,
    payment: 0,
    roi: 0,
    prev: { cost: 0, activations: 0, payment: 0, roi: 0 },
    daily: [],
    accounts: [],
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const currentUser = await getCurrentDingtalkUser();
  if (currentUser.kind === "unauth") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (currentUser.kind === "user_not_synced") {
    return NextResponse.json({ error: "AUTH_USER_NOT_SYNCED" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
  const dateFrom = sp.get("date_from") ?? today;
  const dateTo = sp.get("date_to") ?? today;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return NextResponse.json({ error: "INVALID_DATE" }, { status: 400 });
  }
  if (dateFrom > dateTo) {
    return NextResponse.json({ error: "DATE_FROM_AFTER_TO" }, { status: 400 });
  }

  const scope = await resolvePlacementScope(currentUser.dingtalkUserId, currentUser.isEmergency);
  if (scope.kind === "reject") {
    return NextResponse.json({
      date_from: dateFrom,
      date_to: dateTo,
      products: PRODUCTS.map((product) => emptyProduct(product.id, product.label)),
    } satisfies BuyuDashboardResponse);
  }

  try {
    const prevFrom = periodStart(dateFrom, dateTo);
    const rows = (await db.execute(sql`
      WITH latest_daily AS (
        SELECT DISTINCT ON (c.dataset_id, c.live_account_id, c.subaccount_name, c.date)
          c.dataset_id,
          c.date,
          c.live_account_id,
          c.subaccount_name,
          a.account_name,
          c.cost_yuan::float AS cost,
          c.activations::int AS activations,
          c.payment_yuan::float AS payment
        FROM placement_cumulative_raw c
        LEFT JOIN live_account a ON a.id = c.live_account_id
        WHERE c.date BETWEEN ${prevFrom} AND ${dateTo}
          AND c.raw ? '_source_sheet'
          AND c.dataset_id IN (${sql.join(
            PRODUCTS.map((product) => sql`${product.id}`),
            sql`, `,
          )})
          ${scopeClause(scope)}
        ORDER BY c.dataset_id, c.live_account_id, c.subaccount_name, c.date, c.hour DESC
      )
      SELECT
        dataset_id,
        date::text AS date,
        live_account_id,
        MAX(account_name) AS account_name,
        COALESCE(SUM(cost), 0)::float AS cost,
        COALESCE(SUM(activations), 0)::int AS activations,
        COALESCE(SUM(payment), 0)::float AS payment
      FROM latest_daily
        GROUP BY dataset_id, date, live_account_id
      ORDER BY dataset_id, date, live_account_id
    `)) as unknown as {
      dataset_id: ProductId;
      date: string;
      live_account_id: string;
      account_name: string | null;
      cost: number;
      activations: number;
      payment: number;
    }[];

    const result = PRODUCTS.map((product) => {
      const productRows = rows.filter((row) => row.dataset_id === product.id);
      const daily = productRows.filter((row) => row.date >= dateFrom && row.date <= dateTo);
      const previous = productRows.filter((row) => row.date >= prevFrom && row.date < dateFrom);
      const latestByAccount = (items: typeof productRows) => {
        const latest = new Map<string, (typeof productRows)[number]>();
        for (const row of items) {
          const current = latest.get(row.live_account_id);
          if (!current || row.date > current.date) latest.set(row.live_account_id, row);
        }
        return [...latest.values()];
      };
      const sum = (items: typeof productRows) =>
        items.reduce(
          (total, row) => ({
            cost: total.cost + Number(row.cost ?? 0),
            activations: total.activations + Number(row.activations ?? 0),
            payment: total.payment + Number(row.payment ?? 0),
          }),
          { cost: 0, activations: 0, payment: 0 },
        );
      const currentSnapshots = latestByAccount(daily);
      const previousSnapshots = latestByAccount(previous);
      const currentTotal = sum(currentSnapshots);
      const previousTotal = sum(previousSnapshots);
      const dailyTotals = new Map<
        string,
        { date: string; cost: number; activations: number; payment: number }
      >();
      for (const row of daily) {
        const current = dailyTotals.get(row.date) ?? {
          date: row.date,
          cost: 0,
          activations: 0,
          payment: 0,
        };
        current.cost += Number(row.cost ?? 0);
        current.activations += Number(row.activations ?? 0);
        current.payment += Number(row.payment ?? 0);
        dailyTotals.set(row.date, current);
      }
      return {
        dataset_id: product.id,
        label: product.label,
        ...currentTotal,
        roi: currentTotal.cost > 0 ? currentTotal.payment / currentTotal.cost : 0,
        prev: {
          ...previousTotal,
          roi: previousTotal.cost > 0 ? previousTotal.payment / previousTotal.cost : 0,
        },
        daily: [...dailyTotals.values()].sort((left, right) => left.date.localeCompare(right.date)),
        accounts: currentSnapshots
          .map((row) => {
            const account = {
              account_id: row.live_account_id,
              account_name: row.account_name ?? "未绑定账号",
              cost: Number(row.cost ?? 0),
              activations: Number(row.activations ?? 0),
              payment: Number(row.payment ?? 0),
            };
            return {
              ...account,
              cpi: account.activations > 0 ? account.cost / account.activations : null,
              realtime_roi: account.cost > 0 ? account.payment / account.cost : null,
            };
          })
          .sort((left, right) => right.cost - left.cost),
      } satisfies BuyuProductSummary;
    });
    return NextResponse.json({ date_from: dateFrom, date_to: dateTo, products: result });
  } catch (e) {
    console.error("[/api/dashboard/buyu]", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: "INTERNAL", detail: msg }, { status: 500 });
  }
}
