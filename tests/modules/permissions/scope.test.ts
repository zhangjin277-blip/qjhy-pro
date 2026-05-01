import { describe, it, expect } from "vitest";
import { buildScopeWhereClause } from "@/modules/permissions/scope";

describe("buildScopeWhereClause", () => {
  it("scope=all → no filter (kind: none)", () => {
    const result = buildScopeWhereClause("all", "user-1", []);
    expect(result.kind).toBe("none");
  });

  it("scope=none → reject all (kind: reject)", () => {
    const result = buildScopeWhereClause("none", "user-1", []);
    expect(result.kind).toBe("reject");
  });

  it("scope=self → filter by user_id", () => {
    const result = buildScopeWhereClause("self", "user-1", []);
    expect(result.kind).toBe("self");
    if (result.kind === "self") {
      expect(result.userId).toBe("user-1");
    }
  });

  it("scope=team → filter by managed dept_ids", () => {
    const result = buildScopeWhereClause("team", "user-1", ["dept-A", "dept-B"]);
    expect(result.kind).toBe("team");
    if (result.kind === "team") {
      expect(result.deptIds).toEqual(["dept-A", "dept-B"]);
    }
  });

  it("scope=team with no managed depts → reject (defensive)", () => {
    // 防御：声称 team scope 但没管任何部门，应该看不到任何数据
    const result = buildScopeWhereClause("team", "user-1", []);
    expect(result.kind).toBe("reject");
  });

  it("scope=team accepts single dept", () => {
    const result = buildScopeWhereClause("team", "user-1", ["dept-only"]);
    expect(result.kind).toBe("team");
    if (result.kind === "team") {
      expect(result.deptIds).toHaveLength(1);
    }
  });
});
