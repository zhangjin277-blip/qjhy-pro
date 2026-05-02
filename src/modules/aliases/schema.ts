import { z } from "zod";

export const EntityTypeSchema = z.enum(["dept", "user"]);

export const UpsertAliasInput = z.object({
  entity_type: EntityTypeSchema,
  entity_id: z.string().min(1),
  alias: z.string().min(1).max(64).trim(),
  note: z.string().max(200).trim().optional(),
});

export const DeleteAliasInput = z.object({
  entity_type: EntityTypeSchema,
  entity_id: z.string().min(1),
});

export type UpsertAliasInputType = z.infer<typeof UpsertAliasInput>;
export type DeleteAliasInputType = z.infer<typeof DeleteAliasInput>;
