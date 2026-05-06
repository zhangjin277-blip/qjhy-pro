import { describe, it, expect } from "vitest";
import { readPro3Placements } from "@/modules/placement/pro3-adapter";
import { existsSync } from "node:fs";

const PRO3_DB = "/Users/zhangjin/miracle-pro3/server/database.sqlite";
const skipIfNoDb = !existsSync(PRO3_DB);

describe.skipIf(skipIfNoDb)("readPro3Placements", () => {
  it("读出 product_buyu 至少 100 行", () => {
    const rows = readPro3Placements(PRO3_DB, "product_buyu", { limit: 1000 });
    expect(rows.length).toBeGreaterThan(100);
    const r = rows.at(0);
    expect(r?.account_name).toBeTruthy();
    expect(r?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r?.hour).toBeGreaterThanOrEqual(0);
    expect(r?.hour).toBeLessThanOrEqual(23);
  });

  it("读出 product_ue4 / product_urp", () => {
    const ue4 = readPro3Placements(PRO3_DB, "product_ue4", { limit: 100 });
    const urp = readPro3Placements(PRO3_DB, "product_urp", { limit: 100 });
    expect(ue4.length).toBeGreaterThan(0);
    expect(urp.length).toBeGreaterThan(0);
  });

  it("数值字段都是 number", () => {
    const rows = readPro3Placements(PRO3_DB, "product_buyu", { limit: 500 });
    expect(rows.every((r) => typeof r.cost_yuan === "number")).toBe(true);
    expect(rows.every((r) => typeof r.activations === "number")).toBe(true);
  });

  it("过滤日期范围", () => {
    const rows = readPro3Placements(PRO3_DB, "product_buyu", {
      date_from: "2025-12-01",
      date_to: "2025-12-31",
      limit: 5000,
    });
    expect(rows.every((r) => r.date >= "2025-12-01" && r.date <= "2025-12-31")).toBe(true);
  });
});
