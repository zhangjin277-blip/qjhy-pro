import { z } from "zod";

export const OperationMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const SaveOperationTargetInput = z.object({
  userId: z.string().min(1),
  month: OperationMonth,
  fanTicketTarget: z.coerce.number().min(0),
  flowTarget: z.coerce.number().min(0),
  activeAnchorTarget: z.coerce.number().min(0),
});
