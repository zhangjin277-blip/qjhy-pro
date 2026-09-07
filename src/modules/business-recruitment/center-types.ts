import type { RecruitmentPipelineStage } from "./center-workflow";

export interface RecruitmentApplicationRow {
  id: string;
  candidateId: string;
  candidateName: string;
  phone: string | null;
  project: string | null;
  channel: string;
  sourceAccount: string | null;
  recruiterUserId: string | null;
  recruiterName: string;
  stage: RecruitmentPipelineStage;
  invitedDate: string;
  interviewDate: string | null;
  interviewTime: string | null;
  attendanceStatus: "pending" | "attended" | "no_show";
  initialResult: "pending" | "pass" | "fail";
  finalResult: "pending" | "pass" | "fail";
  offerStatus: "pending" | "sent" | "declined";
  expectedJoinDate: string | null;
  actualJoinDate: string | null;
  trialResult: "pending" | "pass" | "fail";
  trialDate: string | null;
  mentorUserId: string | null;
  mentorName: string | null;
  contractStatus: "pending" | "signed" | "declined";
  leaveDate: string | null;
  leaveReason: string | null;
  notes: string | null;
  updatedAt: string;
}

export interface RecruitmentDemandRow {
  id: string;
  month: string;
  category: string | null;
  project: string;
  targetCount: number;
  joinedCount: number;
  trialPassedCount: number;
  notes: string | null;
}

export interface RecruitmentFunnelStep {
  key: string;
  label: string;
  count: number;
  conversionRate: number | null;
}

export interface RecruitmentRecruiterMetric {
  recruiterName: string;
  invited: number;
  attended: number;
  joined: number;
  trialPassed: number;
  attendanceRate: number;
  trialPassRate: number;
}

export interface RecruitmentMonthlyTrend {
  month: string;
  invited: number;
  attended: number;
  joined: number;
  trialPassed: number;
}

export interface RecruitmentCenterData {
  applications: RecruitmentApplicationRow[];
  demands: RecruitmentDemandRow[];
  funnel: RecruitmentFunnelStep[];
  recruiterMetrics: RecruitmentRecruiterMetric[];
  monthlyTrend: RecruitmentMonthlyTrend[];
  staff: { userId: string; name: string }[];
  capabilities: {
    canEditPipeline: boolean;
    canManageDemand: boolean;
    canImport: boolean;
  };
}

export interface RecruitmentPipelineImportIssue {
  row: number;
  message: string;
}

export interface RecruitmentPipelineImportResult {
  imported: number;
  skipped: number;
  issues: RecruitmentPipelineImportIssue[];
}
