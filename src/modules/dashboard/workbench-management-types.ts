import type { WorkbenchSection } from "./workbench-types";

export type CalendarStatus =
  | "none"
  | "normal"
  | "late"
  | "early"
  | "missing"
  | "absent"
  | "leave"
  | "outing"
  | "repair"
  | "rest"
  | "explained";
export interface CalendarDay {
  date: string;
  status: CalendarStatus;
  label: string;
  on: string | null;
  off: string | null;
  remark: string | null;
  approvals: { type: string; start: string; end: string | null; reason: string | null }[];
}
export interface PersonalCalendar {
  month: string;
  name: string | null;
  unavailable: string | null;
  days: CalendarDay[];
}
export interface DepartmentMember {
  id: string;
  name: string;
  title: string | null;
  status: "regular" | "probation" | "inactive" | "unknown";
  hireDate: string | null;
  firstSyncedDate: string | null;
  lastInactiveDate: string | null;
  absent: boolean | null;
  leave: boolean | null;
}
export interface DepartmentOverview {
  id: string;
  name: string;
  originalName?: string;
  active: number;
  probation: number;
  unknown: number;
  hired: number;
  inactive: number;
  departed: number;
  absent: number | null;
  leave: number | null;
  members: DepartmentMember[];
}
export interface EditorOverview {
  id: string;
  name: string;
  today: number;
  month: number;
  editing: number;
  review: number;
}
export interface ManagementData {
  today: string;
  yesterday: string;
  month: string;
  personnel: WorkbenchSection<{
    departments: DepartmentOverview[];
    attendanceNote: string | null;
  }> & { hidden: boolean };
  editors: WorkbenchSection<{ management: boolean; rows: EditorOverview[] }>;
}
