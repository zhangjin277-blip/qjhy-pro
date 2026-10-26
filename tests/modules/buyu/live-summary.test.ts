import { describe, expect, it } from "vitest";
import {
  buyuAccountDetails,
  latestBuyuRows,
  resolveBuyuTaskRoi,
  summarizeBuyuProduct,
  type BuyuDailyRow,
} from "@/modules/buyu/live-summary";

function row(overrides: Partial<BuyuDailyRow> = {}): BuyuDailyRow {
  return {
    product: "3D",
    datasetId: "product_buyu",
    date: "2026-09-30",
    accountId: "a",
    accountName: "内部A",
    cost: 100,
    additions: 10,
    cpi: 10,
    payment: 1,
    realtimeRoi: 0.01,
    reportMetrics: {},
    summaryMetrics: { month: { 实时净ROI: 0.12 } },
    ...overrides,
  };
}

describe("捕鱼直播与首页的共用口径", () => {
  it("sums every selected day for metrics but counts each account once using its latest monthly ROI", () => {
    const rows = [
      row(),
      row({
        date: "2026-09-29",
        cost: 200,
        additions: 5,
        summaryMetrics: { month: { 实时净ROI: 0.05 } },
      }),
    ];
    expect(summarizeBuyuProduct(rows, "3D", 0.12)).toMatchObject({
      cost: 300,
      additions: 15,
      cpi: 20,
      achievement: { target: 1, below: 0 },
    });
    expect(latestBuyuRows(rows)).toHaveLength(1);
    expect(buyuAccountDetails(rows, "3D", 0.12)[0]).toMatchObject({
      cost: 100,
      additions: 10,
      sevenDayRoi: 0.12,
      achievementRate: 1,
    });
  });

  it("excludes external accounts and other products from product cards, while retaining external detail", () => {
    const rows = [
      row(),
      row({ accountId: "ext", accountName: "阿瓷", cost: 10000 }),
      row({ product: "UE4", datasetId: "product_ue4", accountId: "ue4" }),
    ];
    expect(summarizeBuyuProduct(rows, "3D", 0.12)).toMatchObject({
      cost: 100,
      additions: 10,
      achievement: { target: 1 },
    });
    expect(buyuAccountDetails(rows, "3D", 0.12)).toHaveLength(2);
    expect(buyuAccountDetails(rows, "3D", 0.12)[0]?.external).toBe(true);
  });

  it("uses the monthly report ROI rather than payment/cost, with nonoverlapping target bands", () => {
    const values = [0.12, 0.108, 0.096, 0.095];
    const rows = values.map((roi, index) =>
      row({
        accountId: `${index}`,
        accountName: `内部${index}`,
        payment: 1000,
        summaryMetrics: { month: { 实时净ROI: roi } },
      }),
    );
    expect(summarizeBuyuProduct(rows, "3D", 0.12).achievement).toEqual({
      target: 1,
      ninety: 1,
      eighty: 1,
      below: 1,
      unknown: 0,
    });
  });

  it("keeps missing ROI unknown even when daily payment/cost would qualify", () => {
    const rows = [row({ payment: 1000, summaryMetrics: undefined })];
    expect(summarizeBuyuProduct(rows, "3D", 0.12).achievement).toMatchObject({
      target: 0,
      below: 0,
      unknown: 1,
    });
    expect(buyuAccountDetails(rows, "3D", 0.12)[0]).toMatchObject({
      sevenDayRoi: null,
      achievementRate: null,
    });
    expect(summarizeBuyuProduct([], "3D", 0.12)).toMatchObject({
      cost: 0,
      additions: 0,
      cpi: null,
    });
  });

  it("reads the same product targets from the selected month's local configuration", () => {
    const saved = JSON.stringify({ "2026-09": { "3D": 0.2, UE4: 0.3, URP: 0.1 } });
    expect(resolveBuyuTaskRoi("2026-09-30", saved)).toEqual({ "3D": 0.2, UE4: 0.3, URP: 0.1 });
    expect(resolveBuyuTaskRoi("2026-10-01", saved)).toEqual({ "3D": 0.12, UE4: 0.135, URP: 0.075 });
    expect(resolveBuyuTaskRoi("2026-09-30", "broken JSON")).toEqual({
      "3D": 0.12,
      UE4: 0.135,
      URP: 0.075,
    });
  });
});
