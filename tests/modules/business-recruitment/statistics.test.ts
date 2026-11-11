import { describe, expect, it } from "vitest";
import {
  calculateRecruitmentStatistics,
  shanghaiMonth,
  type RecruitmentStatisticsCandidate,
} from "@/modules/business-recruitment/statistics";

const candidate: RecruitmentStatisticsCandidate = {
  id: "one",
  recruiterUserId: "owner",
  recruiterName: "经纪人",
  anchorName: "主播",
  accountId: "account",
  anchorId: "uid",
  joinDate: "2026-10-30",
};
const days = (from: string, count: number, hours = 2) =>
  Array.from({ length: count }, (_, i) => ({
    anchorId: "uid",
    date: new Date(Date.parse(from + "T00:00:00Z") + i * 86400000).toISOString().slice(0, 10),
    hours,
  }));

describe("招募月度统计口径", () => {
  it("按北京时间确定默认月份", () => {
    expect(shanghaiMonth(new Date("2026-10-31T16:00:00Z"))).toBe("2026-11");
  });
  it("10月入会，11月6日累计首次达标计11月，次月不重复", () => {
    const facts = days("2026-10-31", 7);
    const october = calculateRecruitmentStatistics("2026-10", [candidate], facts);
    expect(october.summaries[0]).toMatchObject({ joined: 1, qualified: 0, active: 0 });
    const november = calculateRecruitmentStatistics("2026-11", [candidate], facts);
    expect(november.summaries[0]).toMatchObject({ joined: 0, qualified: 1, active: 0 });
    expect(november.details[0]).toMatchObject({
      qualifiedDate: "2026-11-06",
      liveDays: 6,
      liveHours: 12,
    });
    expect(
      calculateRecruitmentStatistics("2026-12", [candidate], facts).summaries[0]?.qualified,
    ).toBe(0);
  });
  it("两个阈值都必须达到，达标日取较晚的一天", () => {
    const facts = [...days("2026-10-31", 7, 1), { anchorId: "uid", date: "2026-11-08", hours: 7 }];
    expect(
      calculateRecruitmentStatistics("2026-11", [candidate], facts).details[0]?.qualifiedDate,
    ).toBe("2026-11-08");
    expect(
      calculateRecruitmentStatistics("2026-11", [candidate], days("2026-11-01", 6, 10)).details[0]
        ?.qualified,
    ).toBe(false);
  });
  it("月度20天60小时含边界，不把上月天数和时长带入", () => {
    const facts = [...days("2026-10-01", 20, 3), ...days("2026-11-01", 20, 3)];
    expect(calculateRecruitmentStatistics("2026-11", [candidate], facts).details[0]).toMatchObject({
      active: true,
      liveDays: 20,
      liveHours: 60,
    });
    expect(calculateRecruitmentStatistics("2026-12", [candidate], facts).details[0]?.active).toBe(
      false,
    );
    expect(
      calculateRecruitmentStatistics("2026-11", [candidate], days("2026-11-01", 19, 4)).details[0]
        ?.active,
    ).toBe(false);
    expect(
      calculateRecruitmentStatistics("2026-11", [candidate], days("2026-11-01", 20, 2.99))
        .details[0]?.active,
    ).toBe(false);
  });
  it("排除入会前、未来月份、零时长，重复日期不重复计算", () => {
    const facts = [
      ...days("2026-10-01", 20, 3),
      ...days("2026-11-01", 6),
      ...days("2026-11-01", 6),
      { anchorId: "uid", date: "2026-11-07", hours: 0 },
      ...days("2026-12-01", 20, 3),
    ];
    expect(calculateRecruitmentStatistics("2026-11", [candidate], facts).details[0]).toMatchObject({
      liveDays: 6,
      liveHours: 12,
      qualified: false,
      active: false,
    });
  });
  it("身份未匹配仍统计入会，但不冒充直播达标", () => {
    const result = calculateRecruitmentStatistics(
      "2026-10",
      [{ ...candidate, anchorId: null }],
      days("2026-10-01", 30, 3),
    );
    expect(result.unmatched).toBe(1);
    expect(result.summaries[0]).toMatchObject({ joined: 1, qualified: 0, active: 0 });
  });
  it("没有入会日期不能推断新主播达标，月度活跃可以统计", () => {
    expect(
      calculateRecruitmentStatistics(
        "2026-11",
        [{ ...candidate, joinDate: null }],
        days("2026-11-01", 20, 3),
      ).details[0],
    ).toMatchObject({ joined: false, qualified: false, active: true });
  });
  it("已知首播早于已采集历史时，不把后续达标冒充首次达标", () => {
    const result = calculateRecruitmentStatistics(
      "2026-11",
      [{ ...candidate, firstLiveDate: "2026-10-31" }],
      days("2026-11-01", 20, 3),
    );
    expect(result.details[0]).toMatchObject({
      historyIncomplete: true,
      qualifiedDate: null,
      qualified: false,
      active: true,
    });
  });
});
