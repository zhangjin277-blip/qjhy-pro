import { describe, it, expect } from "vitest";
import { mergePermissions, scopeAtLeast, MAX_SCOPE } from "@/modules/permissions/resolve";
import type { Permission } from "@/modules/permissions";

describe("scopeAtLeast", () => {
  it("none < self < team < all", () => {
    expect(scopeAtLeast("self", "none")).toBe(true);
    expect(scopeAtLeast("none", "self")).toBe(false);
    expect(scopeAtLeast("all", "team")).toBe(true);
    expect(scopeAtLeast("team", "all")).toBe(false);
    expect(scopeAtLeast("self", "self")).toBe(true);
  });
});

describe("MAX_SCOPE", () => {
  it("returns the strongest scope", () => {
    expect(MAX_SCOPE("none", "self")).toBe("self");
    expect(MAX_SCOPE("self", "team")).toBe("team");
    expect(MAX_SCOPE("team", "all")).toBe("all");
    expect(MAX_SCOPE("self", "self")).toBe("self");
    expect(MAX_SCOPE("none", "none")).toBe("none");
    expect(MAX_SCOPE("all", "none")).toBe("all");
  });
});

describe("mergePermissions (三层叠加)", () => {
  const NULL_PERM: Permission = {
    scope: "none",
    can_edit: false,
    can_export: false,
    can_admin: false,
  };

  it("only role default — no dept_leader, no override", () => {
    const role: Permission = {
      scope: "self",
      can_edit: true,
      can_export: false,
      can_admin: false,
    };
    const result = mergePermissions(role, false, null);
    expect(result.scope).toBe("self");
    expect(result.can_edit).toBe(true);
    expect(result.can_export).toBe(false);
  });

  it("dept_leader=true upgrades scope to team", () => {
    const role: Permission = {
      scope: "self",
      can_edit: false,
      can_export: false,
      can_admin: false,
    };
    const result = mergePermissions(role, true, null);
    expect(result.scope).toBe("team");
  });

  it("dept_leader doesn't downgrade if role is already higher", () => {
    const role: Permission = {
      scope: "all",
      can_edit: true,
      can_export: true,
      can_admin: true,
    };
    const result = mergePermissions(role, true, null);
    expect(result.scope).toBe("all"); // dept_leader's team < role's all → keeps all
  });

  it("override.scope upgrades to higher", () => {
    const role: Permission = {
      scope: "self",
      can_edit: false,
      can_export: false,
      can_admin: false,
    };
    const override = { scope: "all" as const };
    const result = mergePermissions(role, false, override);
    expect(result.scope).toBe("all");
  });

  it("override scope cannot downgrade (MAX semantics)", () => {
    const role: Permission = {
      scope: "all",
      can_edit: true,
      can_export: true,
      can_admin: true,
    };
    const override = { scope: "none" as const };
    const result = mergePermissions(role, true, override);
    // MAX(role.all, dept_leader→team, override.none) = all
    expect(result.scope).toBe("all");
  });

  it("partial override only overrides specified can_* fields", () => {
    const role: Permission = {
      scope: "self",
      can_edit: true,
      can_export: false,
      can_admin: false,
    };
    const override = { can_export: true }; // 只 override can_export
    const result = mergePermissions(role, false, override);
    expect(result.scope).toBe("self"); // 来自 role
    expect(result.can_edit).toBe(true); // 来自 role
    expect(result.can_export).toBe(true); // 来自 override
    expect(result.can_admin).toBe(false); // 来自 role
  });

  it("override can_* false explicitly overrides role's true", () => {
    const role: Permission = {
      scope: "all",
      can_edit: true,
      can_export: true,
      can_admin: true,
    };
    const override = { can_admin: false };
    const result = mergePermissions(role, false, override);
    expect(result.can_admin).toBe(false); // 显式 false 应该生效
  });

  it("null override returns role unchanged (no dept_leader)", () => {
    const role: Permission = {
      scope: "self",
      can_edit: true,
      can_export: false,
      can_admin: false,
    };
    const result = mergePermissions(role, false, null);
    expect(result).toEqual(role);
  });

  it("NULL_PERM + no dept_leader + null override → NULL_PERM", () => {
    const result = mergePermissions(NULL_PERM, false, null);
    expect(result).toEqual(NULL_PERM);
  });

  it("dept_leader true + override scope=all stays at all", () => {
    const role: Permission = {
      scope: "none",
      can_edit: false,
      can_export: false,
      can_admin: false,
    };
    const override = { scope: "all" as const, can_admin: true };
    const result = mergePermissions(role, true, override);
    expect(result.scope).toBe("all");
    expect(result.can_admin).toBe(true);
  });
});
