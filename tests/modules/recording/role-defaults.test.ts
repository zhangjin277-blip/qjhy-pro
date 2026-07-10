import { describe, expect, it } from "vitest";
import { ROLE_DEFAULTS_SEED } from "@/modules/permissions/role-defaults";

describe("recording 权限种子", () => {
  const rows = ROLE_DEFAULTS_SEED.filter((r) => r.module === "recording");

  it("每个岗位都有 recording 行", () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBe(new Set(rows.map((r) => r.position)).size);
  });

  it("全员 scope=all，can_export 关死", () => {
    for (const r of rows) {
      expect(r.scope).toBe("all");
      expect(r.can_export).toBe(false);
    }
  });

  it("仅总监/老板有 can_edit 与 can_admin", () => {
    for (const r of rows) {
      const isBoss = r.position === "总监" || r.position === "老板";
      expect(r.can_edit).toBe(isBoss);
      expect(r.can_admin).toBe(isBoss);
    }
  });
});
