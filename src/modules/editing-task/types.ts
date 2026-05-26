import type { EditingTaskStatus, EditingEventType, EditingTaskPriority } from "@/db/schema";

export type { EditingTaskStatus, EditingEventType, EditingTaskPriority };

export interface BoardCard {
  id: number;
  status: EditingTaskStatus;
  liveAccountId: string;
  liveAccountName: string;
  product: string;
  productShort: string;
  productAccentColor: string;
  anchorName: string | null;
  editorUserId: string | null;
  editorName: string | null;
  materialDate: string;
  // status 入列时间，用于停留时长计算
  enteredStatusAt: string;
  publishedAt: string | null;
  isDisqualified: boolean;
  disqualifiedReason: string | null;
  priority: EditingTaskPriority;
  isDuplicate: boolean;
}

export interface TaskDetail extends BoardCard {
  sourceFiles: string[];
  sourceFileNames: string[];
  sourceUploadedAt: string | null;
  editedFiles: string[];
  editedFileNames: string[];
  editedUploadedAt: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  publishedByName: string | null;
  videoId: string | null;
  sourceRemark: string | null;
  createdByName: string;
  createdAt: string;
  disqualifiedByName: string | null;
  disqualifiedAt: string | null;
  urgentReason: string | null;
  coverImage: string | null;
  duplicateOf: number | null;
  sourceFileHashes: string[];
  editedFileHashes: string[];
}

export interface TaskEvent {
  id: number;
  eventType: EditingEventType;
  actorUserId: string;
  actorName: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

// ---- Gantt / 完成统计 ----

export interface GanttCell {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface GanttProductBreakdown {
  product: string;
  total: number;
  daily: GanttCell[];
}

export interface GanttRow {
  editorUserId: string;
  editorName: string;
  total: number;
  daily: GanttCell[]; // 每天合计
  products: GanttProductBreakdown[]; // 按产品拆
}

export interface MonthlyProductShare {
  editorUserId: string;
  editorName: string;
  total: number;
  byProduct: { product: string; count: number; share: number }[]; // share = 0-1
}

// ---- 统计视图 ----

export interface StatusCounts {
  uploaded: number;
  editing: number;
  review: number;
  ready: number;
  published: number;
}

export interface EditorMonthlyStat {
  editorUserId: string;
  editorName: string;
  completed: number; // 本月 published 且 editor = self
  rejected: number; // 本月 review_rejected 事件，针对 self 的任务
  rejectionRate: number; // rejected / max(completed, 1)
}

export interface AnchorMonthlyStat {
  anchorId: string;
  anchorName: string;
  total: number;
  uploaded: number;
  editing: number;
  review: number;
  ready: number;
  published: number;
  completionRate: number; // published / max(total, 1)
}

// ---- 今日统计面板 ----

export interface TodaySummary {
  uploadedToday: number; // 今天 source_uploaded_at 是今天
  assignedToday: number; // 今天 editing_started_at 是今天
  reviewToday: number; // 今天 edited_uploaded_at 是今天
  approvedToday: number; // 今天 reviewed_at 是今天
  publishedToday: number; // 今天 published_at 是今天
}

export interface TodayAnchorDist {
  anchorId: string | null;
  anchorName: string;
  product: string;
  count: number;
}

export interface TodayEditorLoad {
  editorUserId: string;
  editorName: string;
  assigned: number; // 今天派给该剪辑师的（editing_started_at = today AND editor = X）
  completed: number; // 今天该剪辑师完成（edited_uploaded_at = today AND editor = X）
}

// ---- 捕鱼系今日完成度 ----

export interface FishCoverageItem {
  liveAccountId: string;
  liveAccountName: string;
  product: string;
  anchorId: string | null; // dingtalk_user_id (从 daily_schedule_segment)
  anchorName: string | null;
  uploaded: boolean;
  taskId: number | null;
}

export interface FishCoverage {
  date: string; // YYYY-MM-DD
  total: number;
  uploaded: number;
  missing: number;
  items: FishCoverageItem[];
}
