import { describe, it, expect } from "vitest";
import { overrideInputSchema } from "@/modules/schedule-override/schema";

describe("overrideInputSchema", () => {
  it("accepts minimal valid input", () => {
    const r = overrideInputSchema.parse({
      account_id: "acc-1",
      date: "2026-05-28",
      dingtalk_user_id: "u1",
      time_slots: [["09:00", "12:00"]],
    });
    expect(r.account_id).toBe("acc-1");
    expect(r.time_slots).toHaveLength(1);
    expect(r.reason).toBeUndefined();
  });

  it("accepts reason optional", () => {
    const r = overrideInputSchema.parse({
      account_id: "acc-1",
      date: "2026-05-28",
      dingtalk_user_id: "u1",
      time_slots: [],
      reason: "调休",
    });
    expect(r.reason).toBe("调休");
  });

  it("rejects bad date format", () => {
    expect(() =>
      overrideInputSchema.parse({
        account_id: "acc-1",
        date: "20260528",
        dingtalk_user_id: "u1",
        time_slots: [],
      }),
    ).toThrow();
  });

  it("rejects malformed time tuple", () => {
    expect(() =>
      overrideInputSchema.parse({
        account_id: "acc-1",
        date: "2026-05-28",
        dingtalk_user_id: "u1",
        time_slots: [["9:00", "12:00"]], // 缺前导 0
      }),
    ).toThrow();
  });
});
