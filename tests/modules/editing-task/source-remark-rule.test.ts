import { describe, expect, it } from "vitest";
import { isSourceRemarkRequired } from "@/modules/editing-task/source-remark-rule";

describe("isSourceRemarkRequired", () => {
  it.each(["三国冰河时代", "造化仙府"])("requires a remark for %s", (product) => {
    expect(isSourceRemarkRequired(product)).toBe(true);
  });

  it.each(["捕鱼大作战", "斗地主", "造化仙府2", null, undefined])(
    "keeps remarks optional for %s",
    (product) => {
      expect(isSourceRemarkRequired(product)).toBe(false);
    },
  );
});
