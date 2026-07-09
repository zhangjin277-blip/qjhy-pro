import { z } from "zod";

export const CreateCategoryInput = z.object({
  name: z.string().trim().min(1, "分类名不能为空").max(30),
});
export type CreateCategoryInput = z.infer<typeof CreateCategoryInput>;

export const RenameCategoryInput = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(30),
});

export const DeleteCategoryInput = z.object({
  id: z.number().int().positive(),
});

export const UpdateItemInput = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(120).optional(),
  version: z.string().trim().max(60).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
  categoryId: z.number().int().positive().nullable().optional(),
});
export type UpdateItemInput = z.infer<typeof UpdateItemInput>;

export const DeleteItemInput = z.object({
  id: z.number().int().positive(),
});

export const ListItemsInput = z.object({
  // undefined = 全部；"none" = 未分类；数字 = 指定分类
  category: z.union([z.number().int().positive(), z.literal("none")]).optional(),
  keyword: z.string().trim().max(100).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(100),
});
export type ListItemsInput = z.infer<typeof ListItemsInput>;

/** 上传接口的 multipart 文本字段（上限与 UpdateItemInput 一致）。 */
export const UploadFieldsInput = z.object({
  name: z.string().trim().max(120),
  version: z.string().trim().max(60),
  note: z.string().trim().max(300),
});
