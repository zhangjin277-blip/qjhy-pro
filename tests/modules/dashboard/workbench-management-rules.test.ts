import { describe, expect, it } from "vitest";
import {
  buildCalendar,
  monthBounds,
  calendarSourceSchema,
} from "@/modules/dashboard/workbench-calendar-rules";
import {
  aggregateDepartments,
  type PersonnelSource,
} from "@/modules/dashboard/workbench-personnel-rules";
const source = (records: unknown[], approvals: unknown[] = [], roster: unknown[] = []) =>
  calendarSourceSchema.parse({ records, approvals, roster });
const record = (date: string, on = "Normal", off: string | null = "Normal") => ({
  work_date: date,
  on_duty_result: on,
  off_duty_result: off,
});
describe("personal attendance calendar", () => {
  it("uses Monday first and actual leap-month lengths", () => {
    expect(monthBounds("2026-10")).toEqual({ start: "2026-10-01", end: "2026-10-31", offset: 3 });
    expect(monthBounds("2028-02").end).toBe("2028-02-29");
    expect(() => monthBounds("2026-13")).toThrow();
  });
  it("keeps missing data, incomplete punches and future absences neutral", () => {
    const days = buildCalendar(
      "2026-10",
      "2026-10-14",
      source([
        record("2026-10-12", "Unknown"),
        record("2026-10-13", "Normal", null),
        record("2026-10-15", "Absenteeism"),
      ]),
    );
    for (const index of [0, 11, 12, 14]) expect(days[index]?.status).toBe("none");
  });
  it("retains grace-late as normal and keeps verified anomalies explained", () => {
    const days = buildCalendar(
      "2026-10",
      "2026-10-14",
      source([
        record("2026-10-01", "GraceLate"),
        { ...record("2026-10-02", "Late"), verified_by: 7 },
        record("2026-10-03", "Normal", "Early"),
        record("2026-10-04", "NotSigned"),
      ]),
    );
    expect(days.slice(0, 4).map((d) => d.status)).toEqual([
      "normal",
      "explained",
      "early",
      "missing",
    ]);
    expect(days[0]?.label).toBe("迟");
  });
  it("prioritizes roster rest then approved leave regardless of approval order", () => {
    const approvals = [
      {
        approval_type: "repair_check",
        start_time: "2026-10-01 09:00",
        end_time: "2026-10-03 18:00",
      },
      { approval_type: "leave", start_time: "2026-10-01 09:00", end_time: "2026-10-02 18:00" },
    ];
    const days = buildCalendar(
      "2026-10",
      "2026-10-14",
      source([record("2026-10-01", "Late")], approvals, [
        { work_date: "2026-10-01", status: "rest" },
      ]),
    );
    expect(days.slice(0, 3).map((d) => d.status)).toEqual(["rest", "leave", "repair"]);
  });
});
describe("department personnel overview", () => {
  const person: PersonnelSource = {
    id: "a",
    name: "甲",
    title: null,
    deptIds: ["a", "b"],
    status: "probation",
    hireDate: "2026-10-02",
    firstSyncedDate: "2026-10-03",
    lastInactiveDate: null,
    absent: false,
    leave: true,
  };
  const depts = [
    { id: "root", name: "直播一部", parentId: null },
    { id: "a", name: "一组", parentId: "root" },
    { id: "b", name: "一组", parentId: null },
  ];
  it("counts each employee once by primary department and distinguishes same department names", () => {
    const rows = aggregateDepartments(
      [
        person,
        {
          ...person,
          id: "b",
          deptIds: ["b"],
          status: "inactive",
          hireDate: null,
          firstSyncedDate: null,
        },
      ],
      depts,
      "2026-10",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: "直播一部 / 一组",
      active: 1,
      probation: 1,
      hired: 1,
      leave: 1,
      departed: 0,
    });
    expect(rows[1]).toMatchObject({
      name: "一组",
      active: 0,
      inactive: 1,
      hired: 0,
      departed: 0,
    });
  });
  it("keeps partially unauthorized attendance unknown and does not invent hire/leave dates", () => {
    const [row] = aggregateDepartments(
      [
        person,
        {
          ...person,
          id: "c",
          hireDate: null,
          firstSyncedDate: null,
          status: "unknown",
          absent: null,
          leave: null,
        },
      ],
      depts,
      "2026-10",
    );
    expect(row).toMatchObject({
      active: 2,
      unknown: 1,
      hired: 1,
      absent: null,
      leave: null,
      departed: 0,
    });
  });
  it("counts imported people without hire dates, but does not count refreshed or historical records", () => {
    const [row] = aggregateDepartments(
      [
        { ...person, id: "new", hireDate: null },
        { ...person, id: "old", firstSyncedDate: "2026-09-20" },
        { ...person, id: "baseline", firstSyncedDate: null },
      ],
      depts,
      "2026-10",
    );
    expect(row).toMatchObject({ hired: 1, active: 3, probation: 3 });
  });
  it("counts monthly departure detections even after returning, and leaves undated history out", () => {
    const [row] = aggregateDepartments(
      [
        { ...person, id: "left", status: "inactive", lastInactiveDate: "2026-10-10" },
        {
          ...person,
          id: "returned",
          lastInactiveDate: "2026-10-11",
          firstSyncedDate: "2026-09-01",
        },
        { ...person, id: "history", status: "inactive", lastInactiveDate: null },
        { ...person, id: "last-month", status: "inactive", lastInactiveDate: "2026-09-30" },
      ],
      depts,
      "2026-10",
    );
    expect(row).toMatchObject({ departed: 2, active: 1, inactive: 3 });
  });
});
