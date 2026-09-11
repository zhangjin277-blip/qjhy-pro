import { describe, expect, it } from "vitest";
import { normalizeCourseCategories } from "@/modules/course-center/categories";

describe("normalizeCourseCategories", () => {
  it("removes invalid legacy placeholders and duplicate categories", () => {
    expect(
      normalizeCourseCategories([
        "[object Object]",
        " 途游斗地主 ",
        { id: "tuyou_ddz" },
        "途游斗地主",
        "其他产品",
      ]),
    ).toEqual(["途游斗地主", "其他产品"]);
  });

  it("uses the visible fallback when legacy categories are unusable", () => {
    expect(normalizeCourseCategories([null, "", "[object Object]"])).toEqual(["其他产品"]);
  });
});
