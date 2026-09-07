import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  createRecruitmentImportTemplate,
  parseRecruitmentWorkbook,
} from "@/modules/business-recruitment/import-workbook";

function workbookBuffer(rows: unknown[][]): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "登记表");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

describe("商务招募批量导入", () => {
  it("识别原 26 列登记表并使用默认平台", () => {
    const buffer = workbookBuffer([
      ["线上主播入会信息登记表"],
      [
        "序号",
        "游戏产品",
        "主播姓名",
        "性别",
        "联系电话",
        "主播账号昵称",
        "主播账号ID",
        "UID",
        "账号粉丝数",
        "账号基础情况",
        "政策",
        "招募商务",
        "设备情况（是否有声卡+电脑）",
        "外貌记忆（商务初评）",
        "声色表现（商务初评）",
        "口条表达（商务初评）",
        "网感可塑（商务初评）",
        "心态抗压（商务初评）",
        "商务初评符合项数",
        "运营复评符合项数",
        "最终主播评级",
        "带教运营",
        "运营反馈",
        "入会日期",
        "开播日期",
        "签约状态",
      ],
      [
        1,
        "三国冰河时代",
        "旧主播",
        "女",
        "13800000000",
        "旧昵称",
        "old-001",
        "uid-1",
        "1.2万",
        "有经验",
        "政策 A",
        "张锦",
        "声卡 + 电脑",
        "是",
        "否",
        "是",
        "否",
        "是",
        3,
        4,
        "A类",
        "宋帅",
        "表现稳定",
        "2026/08/01",
        "2026/08/03",
        "待签约",
      ],
    ]);

    const result = parseRecruitmentWorkbook(buffer, "douyin");
    expect(result.issues).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      sourceRow: 3,
      platform: "douyin",
      accountId: "old-001",
      followerCount: 12000,
      appearancePass: true,
      voicePass: false,
      operationReviewCount: 4,
      finalGrade: "A",
      joinDate: "2026-08-01",
      firstLiveDate: "2026-08-03",
      signingStatus: "pending",
    });
  });

  it("解析新版模板的五维选填说明", () => {
    const result = parseRecruitmentWorkbook(createRecruitmentImportTemplate(), "kuaishou");
    expect(result.issues).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      platform: "douyin",
      appearancePass: true,
      appearanceNote: "形象有辨识度",
      internetSensePass: false,
      internetSenseNote: null,
      resilienceNote: "情绪稳定",
    });
  });

  it("报告缺少必填字段的具体行号", () => {
    const buffer = workbookBuffer([
      ["游戏产品", "主播姓名", "主播账号ID"],
      ["三国冰河时代", "", "missing-name"],
    ]);
    const result = parseRecruitmentWorkbook(buffer, "douyin");
    expect(result.rows).toEqual([]);
    expect(result.issues).toEqual([{ row: 2, message: "缺少或无法识别：主播姓名" }]);
  });
});
