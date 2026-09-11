import { z } from "zod";

export const ListCoursesInput = z.object({
  category: z.string().trim().max(120).optional(),
  type: z.string().trim().max(60).optional(),
  stage: z.string().trim().max(60).optional(),
  keyword: z.string().trim().max(120).optional(),
  learningStatus: z.enum(["all", "not_started", "in_progress", "completed"]).default("all"),
  sort: z.enum(["latest", "popular", "liked"]).default("latest"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(12),
});
export type ListCoursesInput = z.infer<typeof ListCoursesInput>;

export const ChapterInput = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  durationMin: z.number().int().min(0).max(100000).optional(),
  content: z.string().max(100000).optional(),
  resourceUrl: z.string().trim().max(2000).optional(),
});
export const CourseInputSchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullish(),
  category: z.string().trim().min(1).max(120),
  categories: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  type: z.enum(["collection", "video", "article", "live"]),
  stage: z.enum(["beginner", "growth", "advanced", "general"]),
  coverPath: z.string().trim().max(2000).nullish(),
  durationMin: z.number().int().min(0).max(100000).optional(),
  content: z.string().max(100000).nullish(),
  videoUrl: z.string().trim().max(4000).nullish(),
  instructor: z.string().trim().max(120).nullish(),
  chapters: z.array(ChapterInput).max(200).optional(),
});
export const ExamQuestionInput = z.object({
  id: z.string().trim().min(1).max(80),
  type: z.enum(["choice", "fill", "essay"]),
  title: z.string().trim().min(1).max(1000),
  options: z.array(z.string().max(500)).max(20).optional(),
  score: z.number().int().min(0).max(10000),
  answer: z.string().max(2000).optional(),
});
