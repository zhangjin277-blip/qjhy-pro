import type { RecruitmentGrade, RecruitmentStatus } from "./workflow";

export interface RecruitmentPerformanceSummary {
  liveDays: number;
  validLiveDuration: number;
  totalFanTicket: number;
  newFollowFans: number;
}

export interface RecruitmentCapabilities {
  actorUserId: string;
  canEditCandidate: boolean;
  canReviewOperation: boolean;
  canManageSigning: boolean;
  canManageDemand: boolean;
}

export interface RecruitmentListRow {
  id: string;
  platform: "douyin" | "kuaishou" | "other";
  gameProduct: string;
  anchorName: string;
  accountNickname: string;
  accountId: string;
  platformNickname: string | null;
  platformAvatar: string | null;
  platformUid: string | null;
  recruiterName: string;
  businessReviewCount: number;
  finalGrade: RecruitmentGrade | null;
  suggestedGrade: RecruitmentGrade | null;
  operatorName: string | null;
  status: RecruitmentStatus;
  updatedAt: string;
  joinDate: string | null;
  firstLiveDate: string | null;
  platformExitStatus: "withdrawn" | "cancelled" | null;
  performance30d: RecruitmentPerformanceSummary | null;
}

export interface RecruitmentEventView {
  id: number;
  actorName: string | null;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface RecruitmentCandidateDetail extends RecruitmentListRow {
  gender: "female" | "male" | "unspecified";
  phone: string;
  uid: string | null;
  followerCount: number;
  accountSummary: string | null;
  policy: string | null;
  recruiterUserId: string;
  equipmentStatus: "ready" | "partial" | "missing" | null;
  willingness: "strong" | "medium" | "weak" | null;
  appearancePass: boolean;
  appearanceNote: string | null;
  voicePass: boolean;
  voiceNote: string | null;
  expressionPass: boolean;
  expressionNote: string | null;
  internetSensePass: boolean;
  internetSenseNote: string | null;
  resiliencePass: boolean;
  resilienceNote: string | null;
  operationReviewCount: number | null;
  operatorUserId: string | null;
  operationFeedback: string | null;
  joinDate: string | null;
  firstLiveDate: string | null;
  signingStatus: "pending" | "signed" | "declined" | "abnormal";
  abnormalNote: string | null;
  createdAt: string;
  events: RecruitmentEventView[];
}

export interface RecruitmentBoardData {
  rows: RecruitmentListRow[];
  staff: { userId: string; name: string }[];
  capabilities: RecruitmentCapabilities;
}
