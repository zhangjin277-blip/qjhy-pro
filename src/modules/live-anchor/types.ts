import type { live_anchor, dingtalk_user } from "@/db/schema";

export type LiveAnchor = typeof live_anchor.$inferSelect;
export type DingtalkUser = typeof dingtalk_user.$inferSelect;

export type AnchorWithDingtalk = LiveAnchor & {
  name: string;
  mobile: string | null;
  active: boolean;
  title: string | null;
};
