import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { parsePipelineWorkbook } from "@/modules/business-recruitment/pipeline-import";

function workbookBuffer(rows: unknown[][]): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "面试邀约表");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

describe("面试邀约表导入", () => {
  it("识别日期、面试结果并推导阶段", () => {
    const result = parsePipelineWorkbook(
      workbookBuffer([
        [
          "邀约日期",
          "面试者姓名",
          "招聘渠道",
          "是否到面",
          "初面",
          "终面",
          "是否发送offer",
          "预计到岗时间",
          "是否到岗",
          "试播结果",
        ],
        ["2026/08/01", "候选人甲", "BOSS", "是", "通过", "通过", "是", "2026/08/10", "是", "通过"],
      ]),
    );
    expect(result.issues).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      candidateName: "候选人甲",
      invitedDate: "2026-08-01",
      attendanceStatus: "attended",
      offerStatus: "sent",
      actualJoinDate: "2026-08-10",
      stage: "trial_pass",
    });
  });

  it("对缺少姓名或日期的行给出行号", () => {
    const result = parsePipelineWorkbook(
      workbookBuffer([
        ["邀约日期", "面试者姓名"],
        ["2026/08/01", ""],
      ]),
    );
    expect(result.rows).toEqual([]);
    expect(result.issues).toEqual([{ row: 2, message: "缺少或无法识别：面试者姓名" }]);
  });
});
