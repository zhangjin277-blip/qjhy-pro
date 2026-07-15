import { describe, it, expect } from "vitest";
import { mergePermissions, scopeAtLeast, MAX_SCOPE } from "@/modules/permissions/resolve";
import type { Scope } from "@/modules/permissions";

describe("scopeAtLeast", () => {
  it("none < self < team < all", () => {
    expect(scopeAtLeast("all", "team")).toBe(true);
    expect(scopeAtLeast("team", "all")).toBe(false);
    expect(scopeAtLeast("self", "self")).toBe(true);
    expect(scopeAtLeast("none", "self")).toBe(false);
  });
});

describe("MAX_SCOPE", () => {
  it("returns the strongest scope", () => {
    const cases: [Scope, Scope, Scope][] = [
      ["none", "self", "self"],
      ["team", "self", "team"],
      ["all", "team", "all"],
      ["none", "none", "none"],
    ];
    for (const [a, b, want] of cases) {
      expect(MAX_SCOPE(a, b)).toBe(want);
    }
  });
});

describe("mergePermissions (三层叠加 · 权限点模型)", () => {
  const role = { scope: "self" as Scope, points: ["account_edit", "schedule_edit"] };

  it("only role default — no dept_leader, no override", () => {
    const p = mergePermissions(role, false, null);
    expect(p.scope).toBe("self");
    expect([...p.points].sort()).toEqual(["account_edit", "schedule_edit"]);
  });

  it("dept_leader=true upgrades scope to team (points unchanged)", () => {
    const p = mergePermissions(role, true, null);
    expect(p.scope).toBe("team");
    expect(p.points.has("account_edit")).toBe(true);
    expect(p.points.size).toBe(2);
  });

  it("dept_leader doesn't downgrade if role is already higher", () => {
    const p = mergePermissions({ scope: "all", points: [] }, true, null);
    expect(p.scope).toBe("all");
  });

  it("override.scope upgrades to higher", () => {
    const p = mergePermissions(role, false, { scope: "all" });
    expect(p.scope).toBe("all");
  });

  it("override scope cannot downgrade (MAX semantics)", () => {
    const p = mergePermissions({ scope: "team", points: [] }, false, { scope: "self" });
    expect(p.scope).toBe("team");
  });

  it("override.points = undefined → 沿用岗位默认点集", () => {
    const p = mergePermissions(role, false, { scope: "all" });
    expect([...p.points].sort()).toEqual(["account_edit", "schedule_edit"]);
  });

  it("override.points = null → 同样沿用岗位默认（显式不覆盖）", () => {
    const p = mergePermissions(role, false, { points: null });
    expect([...p.points].sort()).toEqual(["account_edit", "schedule_edit"]);
  });

  it("override.points = 数组 → 整体替换（可收紧）", () => {
    const p = mergePermissions(role, false, { points: ["account_edit"] });
    expect([...p.points]).toEqual(["account_edit"]);
    expect(p.points.has("schedule_edit")).toBe(false);
  });

  it("override.points = [] → 清空该板块全部点", () => {
    const p = mergePermissions(role, false, { points: [] });
    expect(p.points.size).toBe(0);
  });

  it("override.points 可扩权（替换语义下给更多点）", () => {
    const p = mergePermissions(role, false, {
      points: ["account_edit", "schedule_edit", "delete_review"],
    });
    expect(p.points.has("delete_review")).toBe(true);
  });

  it("空 role + no dept_leader + null override → 全空", () => {
    const p = mergePermissions({ scope: "none", points: [] }, false, null);
    expect(p.scope).toBe("none");
    expect(p.points.size).toBe(0);
  });

  it("dept_leader true + override scope=all stays at all", () => {
    const p = mergePermissions(role, true, { scope: "all" });
    expect(p.scope).toBe("all");
  });
});
