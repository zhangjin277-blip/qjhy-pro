import type { live_account, live_room, dingtalk_user } from "@/db/schema";

export type LiveAccount = typeof live_account.$inferSelect;
export type LiveRoomLite = typeof live_room.$inferSelect;
export type DingtalkUserLite = typeof dingtalk_user.$inferSelect;

export type AccountWithRelations = LiveAccount & {
  room_no: string | null;
  agent_name: string | null;
};
