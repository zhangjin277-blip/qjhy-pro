import { describe, it, expect } from "vitest";
import { parseXlsx, extractDateFromFilename } from "@/modules/placement/xlsx-adapter";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as XLSX from "xlsx";

const fixture = (name: string) =>
  readFileSync(resolve(__dirname, "../../fixtures/placement-excel", name));

describe("extractDateFromFilename", () => {
  it("抓出蓝v-安卓命名的 YYYY-MM-DD 范围", () => {
    expect(
      extractDateFromFilename("蓝v-安卓2026-05-06-2026-05-06_20260506190248_69fb1fd838b97.xlsx"),
    ).toEqual({
      from: "2026-05-06",
      to: "2026-05-06",
    });
  });
  it("抓出广告主 ID 命名", () => {
    expect(
      extractDateFromFilename(
        "12400170319-2026-05-06-2026-05-06_20260506190343_69fb200f7d8d3.xlsx",
      ),
    ).toEqual({
      from: "2026-05-06",
      to: "2026-05-06",
    });
  });
  it("无日期 → null", () => {
    expect(extractDateFromFilename("foo.xlsx")).toBe(null);
  });
  it("guanhao fixture 文件名能抓到日期", () => {
    expect(
      extractDateFromFilename(
        "12400099201-2026-05-06-2026-05-06_20260506190248_69fb1fd847ef0.xlsx",
      ),
    ).toEqual({
      from: "2026-05-06",
      to: "2026-05-06",
    });
  });
});

describe("parseXlsx — 9 列模板（蓝v-安卓，lanv-9cols.xlsx）", () => {
  it("解析出多行，含正确字段", () => {
    const buf = fixture("lanv-9cols.xlsx");
    const out = parseXlsx(buf, "lanv-9cols.xlsx");
    expect(out.errors).toHaveLength(0);
    expect(out.rows.length).toBeGreaterThan(0);
    const first = out.rows.at(0);
    expect(first).toBeDefined();
    expect(first?.account_name).toBeTruthy();
    expect(first?.date).toBe("2026-05-06");
    // CSV "小时 19" 是终点编号（[18:00, 19:00)）；adapter -1 后存起点 18
    expect(first?.hour).toBe(18);
    expect(first?.cost_yuan).toBeGreaterThan(0);
    expect(out.date_range_from).toBe("2026-05-06");
    expect(out.date_range_to).toBe("2026-05-06");
  });
});

describe("parseXlsx — 19 列模板（URP 含下载列，urp-19cols.xlsx）", () => {
  it("解析出含 start_download / finish_download", () => {
    const buf = fixture("urp-19cols.xlsx");
    const out = parseXlsx(buf, "urp-19cols.xlsx");
    expect(out.errors).toHaveLength(0);
    expect(out.rows.length).toBeGreaterThan(0);
    const withDownload = out.rows.find((r) => r.start_download > 0);
    expect(withDownload).toBeDefined();
    expect(withDownload?.finish_download).toBeGreaterThanOrEqual(0);
    expect(withDownload?.date).toBe("2026-05-06");
  });
});

describe("parseXlsx — 6 列模板（官号，guanhao-6cols.xlsx，无日期列）", () => {
  it("从文件名抓日期，账户名称以「官号」开头", () => {
    const buf = fixture("guanhao-6cols.xlsx");
    // 使用包含日期范围的真实文件名（模拟上传时的原始文件名）
    const realFilename = "12400099201-2026-05-06-2026-05-06_20260506190248_69fb1fd847ef0.xlsx";
    const out = parseXlsx(buf, realFilename);
    expect(out.errors).toHaveLength(0);
    expect(out.rows.length).toBeGreaterThan(0);
    const first = out.rows.at(0);
    expect(first).toBeDefined();
    expect(first?.date).toBe("2026-05-06");
    expect(first?.account_name).toMatch(/^官号/);
    expect(first?.cost_yuan).toBeGreaterThan(0);
  });
});

describe("parseXlsx — 错误场景", () => {
  it("文件名无日期 + 文件无日期列（guanhao 格式）→ errors 数组不为空", () => {
    const buf = fixture("guanhao-6cols.xlsx");
    // guanhao 没有日期列，如果文件名也没日期，则每行都报错
    const out = parseXlsx(buf, "no-date-in-name.xlsx");
    expect(out.errors.length).toBeGreaterThan(0);
    expect(out.rows).toHaveLength(0);
  });
});

describe("parseXlsx — 钉钉在线日报", () => {
  it("保留日明细并跳过数值日期形式的月汇总行", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["UE4直播间日报"],
      ["日期", "消耗", "新增", "最新累计付费", "实时净ROI"],
      ["2026年", 10000, 1000, 2000, "20%"],
      [46296, 5000, 500, 1000, "20%"],
      [46324, 200, 20, 40, "20%"],
      [46323, 180, 18, 36, "20%"],
      [46296, 100, 10, 20, "20%"],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "UE4-测试账号");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

    const out = parseXlsx(buffer, "online-product_ue4-2026-10-29.xlsx");

    expect(out.errors).toHaveLength(0);
    expect(out.granularity).toBe("daily");
    expect(out.date_range_from).toBe("2026-10-01");
    expect(out.date_range_to).toBe("2026-10-29");
    expect(out.rows.map((row) => row.date)).toEqual(["2026-10-29", "2026-10-28", "2026-10-01"]);
    expect(out.rows.every((row) => row.hour === 24)).toBe(true);
    expect(out.rows[0]?.raw._summary_year).toMatchObject({ 日期: "2026年" });
    expect(out.rows[0]?.raw._summary_months).toMatchObject({
      "2026-10": { 日期: 46296, 消耗: 5000, 实时净ROI: "20%" },
    });
  });
});
