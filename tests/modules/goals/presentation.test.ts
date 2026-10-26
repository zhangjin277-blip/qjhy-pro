import { describe, expect, it } from "vitest";
import {
  goalCompositeProgress,
  goalDisplayProgress,
  groupGoals,
} from "@/modules/goals/presentation";
import type { Goal } from "@/modules/goals";

const base: Goal = {
  id: "flow",
  period: "2026-06",
  project: "斗地主",
  line: "整体",
  dept_id: "offline",
  owner_ids: ["one", "two"],
  owner_labels: [],
  metric: "小手柄流水",
  unit: "元",
  kind: "sum",
  target: 100000,
  actual: 194700,
  confirmed: true,
  definition: "按月统计",
  parent_id: null,
  binding: {
    source: "douyin",
    product: "ddz",
    field: "controller_total_amount",
    selection: "accounts",
    account_ids: ["one"],
    direction: "gte",
    qualification: null,
  },
  source_result: { status: "ready", note: "全部已同步" },
  as_of: "2026-06-30",
  evidence: "",
  status: "draft",
  version: 1,
  created_by: "one",
  updated_at: "2026-10-16T00:00:00Z",
};

const binding = base.binding;
if (!binding) throw new Error("Test binding required");

describe("weighted composite progress", () => {
  const a = { ...base, target: 100, actual: 42.03 };
  const b = { ...a, id: "second", actual: 0 };
  it("defaults to equal shares and rounds 42.03% and 0% to 21.02%", () => {
    expect(goalCompositeProgress([a, b])).toMatchObject({ percent: 21.02, partial: false });
    expect(
      goalCompositeProgress([
        { ...a, weight: 75 },
        { ...b, weight: 25 },
      ]).percent,
    ).toBe(31.52);
  });
  it("caps each score before weighting so overachievement cannot replace another metric", () => {
    expect(goalCompositeProgress([{ ...a, actual: 200 }, b]).percent).toBe(50);
  });
  it("retains missing shares without confusing recorded zero with unavailable data", () => {
    const result = goalCompositeProgress([a, { ...b, actual: null }]);
    expect(result).toMatchObject({ percent: 21.02, partial: true });
    expect(result.note).toContain("保留权重");
    expect(goalCompositeProgress([b])).toMatchObject({ percent: 0, partial: false });
    expect(goalCompositeProgress([{ ...b, actual: null }])).toMatchObject({
      percent: null,
      partial: true,
    });
  });
  it.each(["pending", "forbidden", "error"] as const)(
    "does not count %s source values",
    (status) => {
      expect(
        goalCompositeProgress([
          a,
          { ...b, actual: 100, source_result: { status, note: "不可用" } },
        ]),
      ).toMatchObject({ percent: 21.02, partial: true });
    },
  );
  it("marks incomplete source data even when an actual has been returned", () => {
    expect(
      goalCompositeProgress([{ ...a, source_result: { status: "partial", note: "缺记录" } }, b]),
    ).toMatchObject({ percent: 21.02, partial: true });
  });
  it("excludes archived and deleted metrics and normalizes remaining shares", () => {
    expect(
      goalCompositeProgress([
        { ...a, weight: 50 },
        { ...b, weight: 50, status: "closed" },
      ]).percent,
    ).toBe(42.03);
    expect(goalCompositeProgress([a, { ...b, deleted_at: "2026-10-16T00:00:00Z" }]).percent).toBe(
      42.03,
    );
    expect(
      goalCompositeProgress([
        { ...a, weight: 100 },
        { ...b, weight: 0, actual: null },
      ]),
    ).toMatchObject({ percent: 42.03, partial: false });
    expect(goalCompositeProgress([{ ...a, weight: 0 }]).percent).toBeNull();
    expect(goalCompositeProgress([]).percent).toBeNull();
  });
  it("scores ratios against a positive threshold and upper limits by compliance", () => {
    expect(
      goalCompositeProgress([{ ...a, kind: "ratio", unit: "%", target: 12, actual: 3.6 }]).percent,
    ).toBe(30);
    expect(goalCompositeProgress([{ ...a, kind: "ratio", target: 0 }]).percent).toBeNull();
    const upper = { ...a, binding: { ...binding, direction: "lte" as const } };
    expect(
      goalCompositeProgress([
        { ...upper, actual: 90 },
        { ...upper, actual: 110 },
      ]).percent,
    ).toBe(50);
    expect(goalCompositeProgress([{ ...a, target: 0, actual: 0 }]).percent).toBe(100);
    expect(goalCompositeProgress([{ ...a, confirmed: false }]).percent).toBeNull();
  });
});

describe("goal progress presentation", () => {
  it("shows actual overachievement while capping the bar", () => {
    expect(goalDisplayProgress(base)).toEqual({
      label: "达成率 194.7%",
      percent: 100,
      partial: false,
    });
  });
  it("shows partial data progress without counting it as an achieved goal", () => {
    const goal: Goal = { ...base, source_result: { status: "partial", note: "缺3个账号记录" } };
    expect(goalDisplayProgress(goal)).toEqual({
      label: "已同步达成率 194.7%",
      percent: 100,
      partial: true,
    });
    expect(groupGoals([goal])[0]).toMatchObject({ achieved: 0, attention: 1 });
  });
  it("keeps a recorded zero distinct from unavailable data", () => {
    expect(goalDisplayProgress({ ...base, actual: 0 }).label).toBe("达成率 0%");
    expect(goalDisplayProgress({ ...base, actual: null }).percent).toBeNull();
    expect(goalDisplayProgress({ ...base, target: null }).percent).toBeNull();
    expect(goalDisplayProgress({ ...base, confirmed: false }).percent).toBeNull();
  });
  it.each(["pending", "forbidden", "error"] as const)(
    "never computes a rate from %s data",
    (status) => {
      expect(
        goalDisplayProgress({ ...base, source_result: { status, note: "待处理" } }),
      ).toMatchObject({ label: "待处理", percent: null });
    },
  );
  it("compares ROI against its threshold without labelling it a completion rate", () => {
    expect(
      goalDisplayProgress({ ...base, kind: "ratio", unit: "%", target: 12, actual: 3.6 }),
    ).toMatchObject({ label: "3.6% / 门槛 12%", percent: 30 });
    expect(goalDisplayProgress({ ...base, kind: "ratio", target: 0 }).percent).toBeNull();
  });
  it("shows upper limits without an inverted completion percentage", () => {
    expect(
      goalDisplayProgress({ ...base, binding: { ...binding, direction: "lte" }, actual: 0 }),
    ).toMatchObject({ label: "0元 / 上限 10万元", percent: null });
    expect(goalDisplayProgress({ ...base, target: 0, actual: 0 })).toMatchObject({
      label: "达成率 100%",
      percent: 100,
    });
  });
});

describe("goal groups", () => {
  it("groups by the owner set, independently of ordering and metric unit", () => {
    const sound = {
      ...base,
      id: "sound",
      metric: "总音浪",
      unit: "音浪",
      owner_ids: ["two", "one"],
    };
    const groups = groupGoals([base, sound]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ achieved: 2, archived: 0, attention: 0 });
    expect(groups[0]?.current).toHaveLength(2);
  });
  it.each([
    { owner_ids: ["other"] },
    { owner_labels: ["待绑定"] },
    { project: "三冰" },
    { period: "2026-07" },
    { line: "另一业务线" },
    { dept_id: "online" },
    { binding: { ...binding, product: "three" } },
  ])("keeps different scope separate: %j", (patch) => {
    expect(groupGoals([base, { ...base, ...patch, id: "other" }])).toHaveLength(2);
  });
  it("keeps archived history visible without including it in current completion or attention", () => {
    const archived: Goal = { ...base, id: "old", status: "closed", actual: null };
    const group = groupGoals([archived, base])[0];
    expect(group).toMatchObject({ achieved: 1, attention: 0, archived: 1 });
    expect(group?.items).toHaveLength(2);
    expect(group?.current).toEqual([base]);
  });
  it("handles an empty list", () => {
    expect(groupGoals([])).toEqual([]);
  });
});
