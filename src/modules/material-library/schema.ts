import { z } from "zod";
import { MATERIAL_TYPES } from "@/db/schema/material";

export const MaterialTypeEnum = z.enum(MATERIAL_TYPES);

export const CreateFolderInput = z.object({
  name: z.string().min(1, "目录名不能为空").max(60),
  parentId: z.number().int().positive().nullable().default(null),
});
export type CreateFolderInput = z.infer<typeof CreateFolderInput>;

export const RenameFolderInput = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(60),
});

export const DeleteFolderInput = z.object({
  id: z.number().int().positive(),
});

export const UpdateAssetInput = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(200).optional(),
  tags: z.array(z.string().min(1).max(40)).max(30).optional(),
  folderId: z.number().int().positive().nullable().optional(),
});
export type UpdateAssetInput = z.infer<typeof UpdateAssetInput>;

export const DeleteAssetInput = z.object({
  id: z.number().int().positive(),
});

export const BatchMoveInput = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
  folderId: z.number().int().positive().nullable(),
});

export const BatchDeleteInput = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
});

export const ListAssetsInput = z.object({
  folderId: z.number().int().positive().nullable().optional(),
  type: MaterialTypeEnum.optional(),
  keyword: z.string().trim().max(100).optional(),
  tags: z.array(z.string()).optional(),
  onlyMine: z.boolean().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(60),
});
export type ListAssetsInput = z.infer<typeof ListAssetsInput>;
