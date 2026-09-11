import { describe, expect, it } from "vitest";

import {
  buildProbationPeriods,
  buildQuarterMonths,
  calculateCombinedManagerScore,
  calculateReviewScore,
  calculateWeightedScore,
  getQuarterPeriod,
  gradeForScore,
} from "@/modules/people-performance/date-utils";

describe("people performance period rules", () => {
  it("builds one two-month probation cycle", () => {
    expect(buildProbationPeriods("2026-01-31", 2)).toEqual([
      {
        label: "2个月试用期考核",
        start: "2026-01-31",
        end: "2026-03-30",
        sequence: 1,
      },
    ]);
  });

  it("builds complete cycles at month 1, 3 and 5 for six-month probation", () => {
    expect(buildProbationPeriods("2026-05-26", 6)).toEqual([
      {
        label: "6个月试用期·第1月节点",
        start: "2026-05-26",
        end: "2026-07-25",
        sequence: 1,
      },
      {
        label: "6个月试用期·第3月节点",
        start: "2026-07-26",
        end: "2026-09-25",
        sequence: 2,
      },
      {
        label: "6个月试用期·第5月节点",
        start: "2026-09-26",
        end: "2026-11-25",
        sequence: 3,
      },
    ]);
  });

  it("builds a quarterly parent and three natural months", () => {
    expect(getQuarterPeriod("2026-08-05")).toMatchObject({
      label: "2026年Q3季度绩效",
      start: "2026-07-01",
      end: "2026-09-30",
    });
    expect(buildQuarterMonths("2026-08-05").map((period) => [period.start, period.end])).toEqual([
      ["2026-07-01", "2026-07-31"],
      ["2026-08-01", "2026-08-31"],
      ["2026-09-01", "2026-09-30"],
    ]);
  });
});

describe("people performance scoring", () => {
  it("adds each goal score into the 100-point total", () => {
    expect(
      calculateWeightedScore([
        { weight: 80, managerScore: 68 },
        { weight: 20, managerScore: 16 },
      ]),
    ).toBe(84);
  });

  it("maps default grades", () => {
    expect([95, 90, 89.9, 80, 79.9, 70, 69.9, 60, 59.9].map(gradeForScore)).toEqual([
      "S",
      "S",
      "A",
      "A",
      "B",
      "B",
      "C",
      "C",
      "D",
    ]);
  });

  it("combines direct and skip-level manager totals at 40/60", () => {
    expect(calculateCombinedManagerScore(80, 90)).toBe(86);
    expect(calculateCombinedManagerScore(80, null)).toBeNull();
  });

  it("uses direct-manager score only for probation", () => {
    expect(calculateReviewScore("probation", 80, null)).toBe(80);
    expect(calculateReviewScore("probation", 80, 90)).toBe(80);
  });

  it("uses 40/60 for monthly reviews and direct score when skip-level is absent", () => {
    expect(calculateReviewScore("monthly", 80, 90)).toBe(86);
    expect(calculateReviewScore("monthly", 80, null)).toBe(80);
  });
});
