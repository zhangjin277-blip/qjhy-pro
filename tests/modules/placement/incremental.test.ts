import { describe, it, expect } from "vitest";
import { computeIncrements, type RawCumulativeRow } from "@/modules/placement/incremental";

const makeRow = (
  date: string,
  hour: number,
  account: string,
  values: Partial<RawCumulativeRow> = {},
): RawCumulativeRow => ({
  date,
  hour,
  dataset_id: "product_buyu",
  account_key: account,
  cost_yuan: 0,
  activations: 0,
  payment_yuan: 0,
  start_download: 0,
  finish_download: 0,
  raw: {},
  ...values,
});

describe("computeIncrements", () => {
  it("单日单账号顺序累加", () => {
    const rows = [
      makeRow("2026-05-06", 9, "A", { cost_yuan: 100 }),
      makeRow("2026-05-06", 10, "A", { cost_yuan: 250 }),
      makeRow("2026-05-06", 11, "A", { cost_yuan: 400 }),
    ];
    const out = computeIncrements(rows);
    expect(out.at(0)?.cost_yuan).toBe(100);
    expect(out.at(1)?.cost_yuan).toBe(150);
    expect(out.at(2)?.cost_yuan).toBe(150);
  });

  it("跨账号独立计算", () => {
    const rows = [
      makeRow("2026-05-06", 9, "A", { cost_yuan: 100 }),
      makeRow("2026-05-06", 10, "B", { cost_yuan: 50 }),
      makeRow("2026-05-06", 10, "A", { cost_yuan: 250 }),
    ];
    const out = computeIncrements(rows);
    const byKey = new Map(out.map((r) => [`${r.account_key}-${r.hour}`, r]));
    expect(byKey.get("A-9")?.cost_yuan).toBe(100);
    expect(byKey.get("B-10")?.cost_yuan).toBe(50);
    expect(byKey.get("A-10")?.cost_yuan).toBe(150);
  });

  it("重置点检测：当前值 < 前一行 30% → 视为新起点", () => {
    const rows = [
      makeRow("2026-05-06", 23, "A", { cost_yuan: 1000 }),
      makeRow("2026-05-07", 0, "A", { cost_yuan: 50 }),
      makeRow("2026-05-07", 1, "A", { cost_yuan: 80 }),
    ];
    const out = computeIncrements(rows);
    expect(out.at(1)?.cost_yuan).toBe(50);
    expect(out.at(2)?.cost_yuan).toBe(30);
  });

  it("增量永不为负：max(0, curr - prev)", () => {
    const rows = [
      makeRow("2026-05-06", 9, "A", { cost_yuan: 100 }),
      makeRow("2026-05-06", 10, "A", { cost_yuan: 95 }),
    ];
    const out = computeIncrements(rows);
    expect(out.at(1)?.cost_yuan).toBe(0);
  });

  it("空输入 → 空输出", () => {
    expect(computeIncrements([])).toEqual([]);
  });

  it("单行输入 → 原样返回", () => {
    const rows = [makeRow("2026-05-06", 9, "A", { cost_yuan: 100 })];
    const out = computeIncrements(rows);
    expect(out.at(0)?.cost_yuan).toBe(100);
  });

  it("乱序输入按 (date,hour) 排序后再算", () => {
    const rows = [
      makeRow("2026-05-06", 11, "A", { cost_yuan: 400 }),
      makeRow("2026-05-06", 9, "A", { cost_yuan: 100 }),
      makeRow("2026-05-06", 10, "A", { cost_yuan: 250 }),
    ];
    const out = computeIncrements(rows);
    const sorted = [...out].sort((a, b) => a.hour - b.hour);
    expect(sorted.at(0)?.cost_yuan).toBe(100);
    expect(sorted.at(1)?.cost_yuan).toBe(150);
    expect(sorted.at(2)?.cost_yuan).toBe(150);
  });

  it("多列同时检测重置（任一列骤降即重置）", () => {
    const rows = [
      makeRow("2026-05-06", 23, "A", { cost_yuan: 1000, activations: 50 }),
      makeRow("2026-05-07", 0, "A", { cost_yuan: 1100, activations: 5 }),
    ];
    const out = computeIncrements(rows);
    expect(out.at(1)?.activations).toBe(5);
    expect(out.at(1)?.cost_yuan).toBe(1100);
  });
});
