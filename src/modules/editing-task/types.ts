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
  sourceDurationSec: number | null; // 素材时长（秒），老任务为 null
  hasSource: boolean; // 有素材文件（source_uploaded_at 非空）
  hasEdited: boolean; // 有成品文件（edited_uploaded_at 非空）
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
  reviewWatchSeconds: number;
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
  total: number; // 完成数 = 交片(edited_uploaded_at)总数
  daily: GanttCell[]; // 每天交片数
  products: GanttProductBreakdown[]; // 按产品拆（按交片）
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
  completed: number; // 本月交片(edited_uploaded_at)且 editor = self
  rejected: number; // 本月 review_rejected 事件，针对 self 的任务
  rejectionRate: number; // rejected / max(completed, 1)
}

export interface AnchorMonthlyCoverage {
  anchorId: string;
  anchorName: string;
  product: string; // 单个捕鱼系产品（每行 = 一个 主播×产品）
  expected: number; // 应上传 = 该产品下开播天数（account×日期 去重）
  uploaded: number; // 实际上传 = 有合格素材的开播日数
  missing: number; // 未传 = expected - uploaded
  coverageRate: number; // uploaded / max(expected, 1)
}

// ---- 今日统计面板 ----

export interface TodaySummary {
  uploadedToday: number; // 区间内 source_uploaded_at 落在 [dateFrom, dateTo]
  assignedToday: number; // 区间内 editing_started_at
  reviewToday: number; // 区间内 edited_uploaded_at（交片）
  approvedToday: number; // 区间内 reviewed_at（审核通过）
  publishedToday: number; // 区间内 published_at
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
  assigned: number; // 派：区间内 editing_started_at（领取/派单）且 editor = X
  submitted: number; // 交片：区间内 edited_uploaded_at 且 editor = X
  approved: number; // 通过：区间内 reviewed_at（审核通过=完成口径）且 editor = X
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
