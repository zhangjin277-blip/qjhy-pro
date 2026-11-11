import { describe, expect, it } from "vitest";

import { BulkConfigureProfilesInput, SaveProfileInput } from "@/modules/people-performance/schema";
import { dingtalkHireDate } from "@/modules/people-performance/date-utils";

describe("DingTalk hire date conversion", () => {
  it("keeps a date-only value unchanged", () => {
    expect(dingtalkHireDate(Date.parse("2026-08-24T00:00:00+08:00"))).toBe("2026-08-24");
  });
});

const profile = {
  userId: "employee",
  managerUserId: "manager",
  hireDate: "2026-08-01",
  employmentStatus: "probation" as const,
  probationMonths: 2 as const,
};

describe("people performance profile validation", () => {
  it("accepts three-month probation and rejects unsupported durations", () => {
    expect(
      SaveProfileInput.safeParse({ ...profile, skipManagerUserId: null, probationMonths: 3 })
        .success,
    ).toBe(true);
    expect(
      SaveProfileInput.safeParse({ ...profile, skipManagerUserId: null, probationMonths: 4 })
        .success,
    ).toBe(false);
  });
  it("accepts an empty skip-level manager", () => {
    expect(SaveProfileInput.safeParse({ ...profile, skipManagerUserId: null }).success).toBe(true);
  });

  it("accepts the same direct and skip-level manager", () => {
    expect(
      SaveProfileInput.safeParse({ ...profile, skipManagerUserId: profile.managerUserId }).success,
    ).toBe(true);
  });

  it("rejects assigning the employee as either manager", () => {
    expect(
      SaveProfileInput.safeParse({
        ...profile,
        managerUserId: profile.userId,
        skipManagerUserId: null,
      }).success,
    ).toBe(false);
    expect(
      SaveProfileInput.safeParse({ ...profile, skipManagerUserId: profile.userId }).success,
    ).toBe(false);
  });
});

describe("bulk profile validation", () => {
  const bulk = {
    userIds: ["employee"],
    managerUserId: "manager",
    skipManagerUserId: null,
    employmentStatus: "probation" as const,
    probationMonths: 2 as const,
    applyProbationGoals: true,
    probationGoals: [
      { title: "目标", description: "", metric: "完成", targetValue: "完成", weight: 100 },
    ],
    applyPerformanceGoals: false,
    performanceGoals: [],
  };

  it("accepts a complete 100-point goal template", () => {
    expect(BulkConfigureProfilesInput.safeParse(bulk).success).toBe(true);
  });
  it("accepts three-month probation in bulk configuration", () => {
    expect(BulkConfigureProfilesInput.safeParse({ ...bulk, probationMonths: 3 }).success).toBe(
      true,
    );
  });

  it("rejects incomplete weights when a template is applied", () => {
    expect(
      BulkConfigureProfilesInput.safeParse({
        ...bulk,
        probationGoals: [{ ...bulk.probationGoals[0], weight: 60 }],
      }).success,
    ).toBe(false);
  });

  it("allows omitted templates when their apply switches are off", () => {
    expect(
      BulkConfigureProfilesInput.safeParse({
        ...bulk,
        applyProbationGoals: false,
        probationGoals: [],
      }).success,
    ).toBe(true);
  });
});
