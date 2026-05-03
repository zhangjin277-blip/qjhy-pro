import { z } from "zod";

const ProjectEnum = z.enum(["all", "ddz", "three"]);

export const SavePresetSchema = z.object({
  name: z.string().min(1).max(40),
  columns: z.array(z.string().min(1)).min(1).max(200),
  project: ProjectEnum.default("all"),
});
export type SavePresetInput = z.infer<typeof SavePresetSchema>;

export const UpdatePresetSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(40).optional(),
  columns: z.array(z.string().min(1)).min(1).max(200).optional(),
  project: ProjectEnum.optional(),
});
export type UpdatePresetInput = z.infer<typeof UpdatePresetSchema>;
