import { z } from "zod";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const AnchorListFiltersSchema = z.object({
  date_from: z.string().regex(DATE_RE),
  date_to: z.string().regex(DATE_RE),
  project: z.enum(["all", "ddz", "three"]).optional(),
  broker_ids: z.array(z.string()).optional(),
  health_min: z.number().int().min(0).max(100).optional(),
  search: z.string().optional(),
  fields: z.array(z.string()).optional(),
});
