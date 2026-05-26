import { describe, it, expect } from "vitest";
import {
  canTransition,
  assertTransition,
  ALLOWED_TRANSITIONS,
} from "@/modules/editing-task/state-machine";

describe("editing state machine", () => {
  it("ALLOWED_TRANSITIONS has all statuses", () => {
    expect(Object.keys(ALLOWED_TRANSITIONS)).toEqual([
      "uploaded",
      "editing",
      "review",
      "ready",
      "published",
    ]);
  });
  it.each([
    ["uploaded", "editing", true],
    ["editing", "uploaded", true],
    ["editing", "review", true],
    ["review", "ready", true],
    ["review", "editing", true],
    ["ready", "published", true],
    // illegal
    ["uploaded", "review", false],
    ["uploaded", "published", false],
    ["editing", "ready", false],
    ["review", "uploaded", false],
    ["ready", "editing", false],
    ["published", "ready", false],
    ["published", "editing", false],
  ])("canTransition %s -> %s = %s", (from, to, expected) => {
    expect(canTransition(from as never, to as never)).toBe(expected);
  });

  it("assertTransition throws on illegal", () => {
    expect(() => assertTransition("published" as never, "editing" as never)).toThrow(/illegal/i);
  });
});
