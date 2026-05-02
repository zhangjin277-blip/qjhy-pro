import { describe, expect, it } from "vitest";
import { DeleteAliasInput, UpsertAliasInput } from "@/modules/aliases/schema";

describe("UpsertAliasInput", () => {
  it("接受合法部门别名输入", () => {
    const r = UpsertAliasInput.parse({
      entity_type: "dept",
      entity_id: "1071560406",
      alias: "内容创意中心",
    });
    expect(r.alias).toBe("内容创意中心");
    expect(r.note).toBeUndefined();
  });

  it("接受带 note 的输入", () => {
    const r = UpsertAliasInput.parse({
      entity_type: "dept",
      entity_id: "x",
      alias: "三组",
      note: "原 内容三组，2026/04 改名",
    });
    expect(r.note).toContain("2026/04");
  });

  it("自动 trim alias 两端空格", () => {
    const r = UpsertAliasInput.parse({
      entity_type: "dept",
      entity_id: "x",
      alias: "  三组  ",
    });
    expect(r.alias).toBe("三组");
  });

  it("拒绝空 alias", () => {
    expect(() =>
      UpsertAliasInput.parse({
        entity_type: "dept",
        entity_id: "x",
        alias: "",
      }),
    ).toThrow();
  });

  it("拒绝超长 alias（>64 字符）", () => {
    expect(() =>
      UpsertAliasInput.parse({
        entity_type: "dept",
        entity_id: "x",
        alias: "a".repeat(65),
      }),
    ).toThrow();
  });

  it("拒绝非法 entity_type", () => {
    expect(() =>
      UpsertAliasInput.parse({
        entity_type: "field",
        entity_id: "x",
        alias: "y",
      }),
    ).toThrow();
  });

  it("拒绝空 entity_id", () => {
    expect(() =>
      UpsertAliasInput.parse({
        entity_type: "dept",
        entity_id: "",
        alias: "y",
      }),
    ).toThrow();
  });
});

describe("DeleteAliasInput", () => {
  it("接受合法删除输入", () => {
    const r = DeleteAliasInput.parse({ entity_type: "dept", entity_id: "x" });
    expect(r.entity_id).toBe("x");
  });

  it("拒绝空 entity_id", () => {
    expect(() => DeleteAliasInput.parse({ entity_type: "dept", entity_id: "" })).toThrow();
  });
});
