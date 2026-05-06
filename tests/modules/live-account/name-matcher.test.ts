import { describe, it, expect } from "vitest";
import { matchName, type DingtalkCandidate } from "@/modules/live-account/name-matcher";

const candidates: DingtalkCandidate[] = [
  { user_id: "u_001", name: "邓明星", mobile: "13800000001" },
  { user_id: "u_002", name: "刘森", mobile: "13800000002" },
  { user_id: "u_003", name: "刘森林", mobile: "13800000003" },
  { user_id: "u_004", name: "李四", mobile: "13800000004" },
];

describe("matchName", () => {
  it("完全匹配 → exact", () => {
    const r = matchName("邓明星", candidates);
    expect(r.kind).toBe("exact");
    if (r.kind === "exact") expect(r.match.user_id).toBe("u_001");
  });

  it("去空格后完全匹配 → exact", () => {
    const r = matchName("  邓明星  ", candidates);
    expect(r.kind).toBe("exact");
  });

  it("包含匹配 → ambiguous", () => {
    const r = matchName("刘森", candidates);
    // "刘森" 完全匹配 u_002，但同时是 "刘森林" 子串 — exact 优先
    expect(r.kind).toBe("exact");
    if (r.kind === "exact") expect(r.match.user_id).toBe("u_002");
  });

  it("仅子串关系 → ambiguous", () => {
    const r = matchName("刘森林夫", candidates);
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous") {
      const ids = r.candidates.map((c) => c.user_id);
      expect(ids).toContain("u_003"); // "刘森林" 是 "刘森林夫" 子串
    }
  });

  it("拼音首字母匹配 → ambiguous", () => {
    const r = matchName("LSL", candidates); // 刘森林 → LSL
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous") {
      const ids = r.candidates.map((c) => c.user_id);
      expect(ids).toContain("u_003");
    }
  });

  it("无匹配 → none", () => {
    const r = matchName("张无忌", candidates);
    expect(r.kind).toBe("none");
  });

  it("空字符串 → none", () => {
    const r = matchName("", candidates);
    expect(r.kind).toBe("none");
  });
});
