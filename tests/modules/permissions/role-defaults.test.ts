import { describe, it, expect } from "vitest";
import { ROLE_DEFAULTS_SEED } from "@/modules/permissions";

describe("ROLE_DEFAULTS_SEED software_library 特例", () => {
  const rows = ROLE_DEFAULTS_SEED.filter((r) => r.module === "software_library");

  it("每个岗位都有 software_library 行", () => {
    expect(rows.length).toBeGreaterThanOrEqual(8);
  });

  it("全员 scope=all（全员可见可下载）", () => {
    expect(rows.every((r) => r.scope === "all")).toBe(true);
  });

  it("仅总监/老板默认 can_edit", () => {
    const editors = rows.filter((r) => r.can_edit).map((r) => r.position);
    expect(editors.sort()).toEqual(["总监", "老板"].sort());
  });
});
