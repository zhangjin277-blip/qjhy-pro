import { describe, it, expect } from "vitest";
import { CreateCategoryInput, ListItemsInput, UpdateItemInput } from "@/modules/software-library";

describe("软件库 Zod schema 边界", () => {
  it("分类名 trim 后不能为空", () => {
    expect(() => CreateCategoryInput.parse({ name: "  " })).toThrow();
    expect(CreateCategoryInput.parse({ name: " 直播工具 " }).name).toBe("直播工具");
  });

  it("ListItemsInput category 联合类型：数字/none/缺省", () => {
    expect(ListItemsInput.parse({}).category).toBeUndefined();
    expect(ListItemsInput.parse({ category: "none" }).category).toBe("none");
    expect(ListItemsInput.parse({ category: 3 }).category).toBe(3);
    expect(() => ListItemsInput.parse({ category: "abc" })).toThrow();
  });

  it("UpdateItemInput version/note 可置空", () => {
    const r = UpdateItemInput.parse({ id: 1, version: null, note: null });
    expect(r.version).toBeNull();
    expect(r.note).toBeNull();
  });
});
