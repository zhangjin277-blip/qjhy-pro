import type { EditingTaskStatus, EditingEventType } from "@/db/schema";

export type { EditingTaskStatus, EditingEventType };

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
}

export interface TaskEvent {
  id: number;
  eventType: EditingEventType;
  actorUserId: string;
  actorName: string;
  payload: Record<string, unknown>;
  createdAt: string;
}
