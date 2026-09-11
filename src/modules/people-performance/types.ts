import type { PerformanceCycleKind, PerformanceStage, PeopleEmploymentStatus } from "@/db/schema";

export interface PerformanceManagerOption {
  userId: string;
  name: string;
}

export interface PeopleListRow {
  userId: string;
  name: string;
  title: string | null;
  department: string;
  managerName: string | null;
  skipManagerName: string | null;
  hireDate: string | null;
  employmentStatus: PeopleEmploymentStatus | null;
  probationMonths: number | null;
  currentCycleId: string | null;
  currentCycleLabel: string | null;
  currentStage: PerformanceStage | null;
  periodEnd: string | null;
  overdueDate: string | null;
  needsMyAction: boolean;
}

export interface PerformanceScoreStatisticsRow {
  userId: string;
  name: string;
  cycleId: string;
  cycleLabel: string;
  periodStart: string;
  score: number | null;
}

export interface PerformanceGoalView {
  id: string;
  title: string;
  description: string;
  metric: string;
  targetValue: string;
  weight: number;
  completion: string | null;
  selfScore: number | null;
  managerScore: number | null;
  managerComment: string | null;
  skipManagerScore: number | null;
  skipManagerComment: string | null;
}

export interface PerformanceCycleView {
  id: string;
  parentCycleId: string | null;
  kind: PerformanceCycleKind;
  label: string;
  periodStart: string;
  periodEnd: string;
  stage: PerformanceStage;
  managerUserId: string | null;
  skipManagerUserId: string | null;
  requiresFinalReview: boolean;
  selfSummary: string | null;
  managerSummary: string | null;
  skipManagerSummary: string | null;
  hrComment: string | null;
  finalScore: number | null;
  finalGrade: string | null;
  probationResult: string | null;
  confirmationDeadline: string | null;
  goals: PerformanceGoalView[];
}

export interface PerformanceEventView {
  id: number;
  cycleId: string;
  actorName: string | null;
  eventType: string;
  fromStage: string | null;
  toStage: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface PeoplePerformanceDetail {
  person: PeopleListRow;
  profile: {
    managerUserId: string | null;
    skipManagerUserId: string | null;
    hireDate: string | null;
    employmentStatus: PeopleEmploymentStatus | null;
    probationMonths: number | null;
    regularizedAt: string | null;
  };
  cycles: PerformanceCycleView[];
  events: PerformanceEventView[];
  managers: PerformanceManagerOption[];
  capabilities: {
    manageProfiles: boolean;
    calibrate: boolean;
    manageAll: boolean;
    actorUserId: string;
  };
}
