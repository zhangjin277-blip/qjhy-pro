import { z } from "zod";
import type { CoreKpiResponse } from "./types";

export const noticeInputSchema = z.object({
  title: z.string().trim().min(1, "请填写公告标题").max(100),
  body: z.string().trim().min(1, "请填写公告正文").max(10000),
  category: z.enum(["通知", "制度", "活动"]).default("通知"),
  pinned: z.boolean().default(false),
});
export const noticeSchema = noticeInputSchema.extend({
  id: z.uuid(),
  publisher: z.string(),
  publishedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().optional(),
  deletedBy: z.string().optional(),
});
export type WorkbenchNotice = z.infer<typeof noticeSchema> & { read: boolean };
export interface WorkbenchSection<T> {
  data: T | null;
  error: string | null;
}
export type VideoStage = "uploaded" | "editing" | "review" | "ready" | "published";
export interface AttendanceBrief {
  recorded: number;
  normal: number;
  pending: number;
  late: number;
  missing: number;
  early: number;
  absent: number;
}
export interface WorkbenchData {
  today: string;
  yesterday: string;
  approvals: WorkbenchSection<{
    canApprove: boolean;
    canCreate: boolean;
    pendingCount: number;
    mineCount: number;
    pending: ApprovalPreview[];
    mine: ApprovalPreview[];
  }>;
  videos: WorkbenchSection<{
    counts: Record<VideoStage, number>;
    today: { uploadedToday: number; reviewToday: number; publishedToday: number };
    tasks: Record<VideoStage, VideoPreview[]>;
  }>;
  attendance: WorkbenchSection<{
    team: AttendanceBrief;
    mine: AttendanceBrief;
    canRemark: boolean;
    scopeLabel: string;
  }>;
  notices: WorkbenchSection<{ items: WorkbenchNotice[]; canPublish: boolean }>;
  business: WorkbenchSection<CoreKpiResponse>;
}
export interface ApprovalPreview {
  id: number;
  title: string;
  submitter: string;
  amount: number;
  status: string;
  createdAt: string;
  price: number;
  quantity: number;
  usage: string | null;
  remarks: string | null;
  invoice: string | null;
  link: string | null;
  screenshot: string | null;
  requester: string | null;
  platform: string | null;
}
export interface VideoPreview {
  id: number;
  account: string;
  product: string;
  editor: string | null;
  date: string;
  urgent: boolean;
}
