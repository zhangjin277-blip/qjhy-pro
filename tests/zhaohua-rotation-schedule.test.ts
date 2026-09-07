import { describe, expect, it } from "vitest";
import {
  endTimeForDuration,
  shiftDurationHours,
} from "@/app/(dashboard)/projects/zhaohua/_components/official-rotation-schedule";

describe("zhaohua rotation schedule time helpers", () => {
  it("calculates same-day and cross-midnight durations", () => {
    expect(shiftDurationHours("12:00", "16:00")).toBe(4);
    expect(shiftDurationHours("22:30", "02:30")).toBe(4);
  });

  it("derives an end time from an integer-hour duration", () => {
    expect(endTimeForDuration("09:30", 4)).toBe("13:30");
    expect(endTimeForDuration("22:30", 4)).toBe("02:30");
  });
});
