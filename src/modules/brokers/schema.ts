import { z } from "zod";

export const SetBrokerMappingInput = z.object({
  broker_id: z.string().min(1),
  dingtalk_user_id: z.string().min(1),
});
export type SetBrokerMappingInputType = z.infer<typeof SetBrokerMappingInput>;
