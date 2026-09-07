import { describe, expect, it } from "vitest";
import {
  formatVsPrevRatio,
  getAbsoluteChange,
} from "@/app/(dashboard)/dashboard/_components/format";

describe("dashboard compare formatting", () => {
  it("treats vs_prev as percentage points", () => {
    expect(formatVsPrevRatio(0.52)).toEqual({ text: "↑0.5%", kind: "up" });
    expect(formatVsPrevRatio(-16)).toEqual({ text: "↓16%", kind: "down" });
  });

  it("calculates exact absolute changes from previous values", () => {
    expect(getAbsoluteChange(120, 100)).toEqual({ value: 20, kind: "up" });
    expect(getAbsoluteChange(0, 25)).toEqual({ value: -25, kind: "down" });
    expect(getAbsoluteChange(8, null)).toEqual({ value: null, kind: "none" });
  });
});
