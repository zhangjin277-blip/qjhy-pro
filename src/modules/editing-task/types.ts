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
