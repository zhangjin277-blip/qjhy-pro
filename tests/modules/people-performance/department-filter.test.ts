import { describe, expect, it } from "vitest";

import {
  belongsToPerformanceDepartment,
  resolvePerformanceDepartmentIds,
} from "@/modules/people-performance/department-filter";

describe("people performance department filter", () => {
  const departments = [
    { id: "company", name: "公司", parentId: null },
    { id: "live-one", name: "直播一部", parentId: "company" },
    { id: "operations", name: "运营", parentId: "live-one" },
    { id: "operations-1", name: "一组", parentId: "operations" },
    { id: "post", name: "后期", parentId: "live-one" },
    { id: "support", name: "公共支持", parentId: "live-one" },
    { id: "anchors", name: "合作主播", parentId: "live-one" },
    { id: "other-root", name: "直播二部", parentId: "company" },
    { id: "other-operations", name: "运营", parentId: "other-root" },
  ];

  it("includes the three configured teams and all of their descendants", () => {
    expect([...resolvePerformanceDepartmentIds(departments)].sort()).toEqual(
      ["operations", "operations-1", "post", "support"].sort(),
    );
  });

  it("excludes anchor and same-name teams outside 直播一部", () => {
    const allowedIds = resolvePerformanceDepartmentIds(departments);

    expect(belongsToPerformanceDepartment(["operations-1"], allowedIds)).toBe(true);
    expect(belongsToPerformanceDepartment(["anchors"], allowedIds)).toBe(false);
    expect(belongsToPerformanceDepartment(["other-operations"], allowedIds)).toBe(false);
  });
});
