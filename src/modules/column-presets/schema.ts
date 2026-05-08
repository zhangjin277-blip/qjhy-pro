import { z } from "zod";

const PlatformEnum = z.enum(["douyin", "kuaishou"]);
// project 字段：抖音 'all'|'ddz'|'three'；快手 product 字符串（"全部"/"捕鱼大作战"/...）
const ProjectField = z.string().min(1).max(40);

export const SavePresetSchema = z.object({
  platform: PlatformEnum.default("douyin"),
  name: z.string().min(1).max(40),
  columns: z.array(z.string().min(1)).min(1).max(200),
  project: ProjectField.default("all"),
});
export type SavePresetInput = z.infer<typeof SavePresetSchema>;

export const UpdatePresetSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(40).optional(),
  columns: z.array(z.string().min(1)).min(1).max(200).optional(),
  project: ProjectField.optional(),
});
export type UpdatePresetInput = z.infer<typeof UpdatePresetSchema>;
