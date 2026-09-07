import { describe, expect, it } from "vitest";
import { validateEcologyRoster } from "@/app/(dashboard)/projects/zhaohua/_components/ecology-roster-manager";
import {
  INITIAL_ECOLOGY_ROSTER,
  type EcologyRosterState,
} from "@/app/(dashboard)/projects/zhaohua/_data/project-roster";

function roster(): EcologyRosterState {
  return {
    operators: INITIAL_ECOLOGY_ROSTER.operators.map((operator) => ({ ...operator })),
    anchors: INITIAL_ECOLOGY_ROSTER.anchors.map((anchor) => ({ ...anchor })),
  };
}

describe("zhaohua ecology roster validation", () => {
  it("accepts the initial roster including institution anchors managed by 丁友发", () => {
    expect(validateEcologyRoster(roster())).toBeNull();
  });

  it("rejects duplicate operator names", () => {
    const value = roster();
    const first = value.operators[0];
    const second = value.operators[1];
    if (!first || !second) throw new Error("initial operator fixture is incomplete");
    value.operators[1] = { ...second, name: first.name };
    expect(validateEcologyRoster(value)).toBe("运营姓名不能重复");
  });

  it("requires a real name for offline anchors", () => {
    const value = roster();
    const first = value.anchors[0];
    if (!first) throw new Error("initial anchor fixture is incomplete");
    value.anchors[0] = { ...first, realName: null };
    expect(validateEcologyRoster(value)).toContain("真实姓名不能为空");
  });
});
