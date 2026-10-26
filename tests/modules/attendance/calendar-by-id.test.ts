import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ actor: vi.fn(), query: vi.fn() }));
vi.mock("@/modules/attendance/pro3/access", () => ({ attendanceActor: m.actor }));
vi.mock("@/modules/attendance/pro3/server/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/attendance/pro3/server/runtime")>()),
  getDatabase: () => ({ query: m.query }),
}));
import { dispatch } from "@/modules/attendance/pro3/server/dispatch";
const records = ["me", "other"].map((dingtalk_userid) => ({
  id: dingtalk_userid,
  name: "同名",
  dingtalk_userid,
  work_date: "2026-10-01",
  on_duty_result: "Normal",
  off_duty_result: "Normal",
  late_minutes: 0,
}));
const approvals = ["me", "other"].map((originator_userid) => ({
  originator_name: "同名",
  originator_userid,
  approval_type: "leave",
  reason: `${originator_userid} reason`,
}));
const roster = ["me", "other"].map((dingtalk_userid) => ({
  name: "同名",
  dingtalk_userid,
  work_date: "2026-10-02",
  status: "rest",
}));
beforeEach(() => {
  vi.clearAllMocks();
  m.actor.mockResolvedValue({
    permissions: [],
    user: { name: "同名", dingtalk_userid: "me", allowedUserIds: ["me"], allowedNames: [] },
  });
  m.query.mockImplementation(async (statement: string, params: string[] = []) => {
    if (statement.includes("FROM attendance_records"))
      return statement.includes("WHERE dingtalk_userid = ?")
        ? records.filter((r) => r.dingtalk_userid === params[0])
        : records;
    if (statement.includes("FROM approval_instances"))
      return statement.includes("WHERE originator_userid = ?")
        ? approvals.filter((r) => r.originator_userid === params[0])
        : approvals;
    if (statement.includes("FROM attendance_roster_days"))
      return statement.includes("AND dingtalk_userid=?")
        ? roster.filter((r) => r.dingtalk_userid === params.at(-1))
        : roster;
    return [];
  });
});
const calendar = (query: string) =>
  dispatch(
    new Request(`http://localhost/api/attendance/pro3/attendance/calendar?month=2026-10&${query}`),
    ["attendance", "calendar"],
  );
describe("calendar reads by employee ID", () => {
  it("reads own punches, approvals and roster without the ambiguous-name restriction", async () => {
    const response = await calendar("user_id=me&name=another-name");
    expect(response.status).toBe(200);
    const { success, data } = await response.json();
    expect(success).toBe(true);
    expect(data.records.map((r: { dingtalk_userid: string }) => r.dingtalk_userid)).toEqual(["me"]);
    expect(data.approvals.map((r: { reason: string }) => r.reason)).toEqual(["me reason"]);
    expect(data.roster.map((r: { dingtalk_userid: string }) => r.dingtalk_userid)).toEqual(["me"]);
  });
  it("rejects an out-of-scope ID even if a permitted name is supplied", async () => {
    m.actor.mockResolvedValue({
      permissions: [],
      user: { allowedUserIds: ["me"], allowedNames: ["同名"] },
    });
    const response = await calendar("user_id=other&name=同名");
    expect(response.status).toBe(403);
    expect(m.query).not.toHaveBeenCalled();
  });
  it("retains the legacy name restriction for callers without an employee ID", async () => {
    expect((await calendar("name=同名")).status).toBe(403);
    expect(m.query).not.toHaveBeenCalled();
  });
  it("keeps name-based calendar requests working for administrators", async () => {
    m.actor.mockResolvedValue({
      permissions: [],
      user: { allowedUserIds: null, allowedNames: null },
    });
    const response = await calendar("name=同名");
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.records).toHaveLength(2);
  });
});
