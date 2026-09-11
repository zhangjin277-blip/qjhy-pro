import { describe, expect, it } from "vitest";
import {
  CourseInputSchema,
  ExamQuestionInput,
  ListCoursesInput,
} from "@/modules/course-center/schema";

describe("course center input validation", () => {
  it("applies stable list defaults", () => {
    expect(ListCoursesInput.parse({})).toEqual({
      learningStatus: "all",
      sort: "latest",
      page: 1,
      pageSize: 12,
    });
  });

  it("accepts a complete multi-category course", () => {
    const value = CourseInputSchema.parse({
      title: "新人基础课",
      category: "途游斗地主",
      categories: ["途游斗地主", "其他产品"],
      type: "video",
      stage: "beginner",
      durationMin: 30,
      chapters: [{ id: "chapter-1", title: "第一章", durationMin: 10 }],
    });
    expect(value.categories).toHaveLength(2);
    expect(value.chapters?.[0]?.title).toBe("第一章");
  });

  it("rejects unsupported course and question types", () => {
    expect(() =>
      CourseInputSchema.parse({
        title: "错误课程",
        category: "其他产品",
        type: "download",
        stage: "beginner",
      }),
    ).toThrow();
    expect(() =>
      ExamQuestionInput.parse({ id: "q1", type: "boolean", title: "题目", score: 10 }),
    ).toThrow();
  });

  it("accepts all supported exam question types", () => {
    for (const type of ["choice", "fill", "essay"] as const) {
      expect(
        ExamQuestionInput.parse({
          id: type,
          type,
          title: "题目",
          score: type === "essay" ? 0 : 10,
          options: type === "choice" ? ["A", "B"] : undefined,
          answer: type === "essay" ? undefined : "A",
        }).type,
      ).toBe(type);
    }
  });
});
