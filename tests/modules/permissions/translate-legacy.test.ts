import { describe, it, expect } from "vitest";
import { translateLegacyPoints } from "@/modules/permissions/role-defaults";
import { MODULE_POINTS, MODULE_KEYS, type ModuleKey } from "@/modules/permissions";

/**
 * 旧三布尔 → 权限点翻译规则快照（与 0054 迁移 SQL 的 _translate_points 必须一致）。
 * 原则：行为等价——迁移上线日无任何人权限变化。
 */
describe("translateLegacyPoints（0054 迁移翻译规则）", () => {
  it("edit=true 时各板块的点集合（行为等价快照）", () => {
    const snap: Record<string, string[]> = {};
    for (const m of MODULE_KEYS) {
      snap[m] = translateLegacyPoints(m, { edit: true, export: false, admin: false });
    }
    expect(snap).toEqual({
      dashboard: [],
      project_zhaohua: ["project_edit"],
      anchors: [],
      crawler: ["run_jobs", "cookie_update", "field_alias"],
      permissions: [],
      live_account: [
        "account_edit",
        "delete_request",
        "schedule_edit",
        "room_edit",
        "room_delete",
        "floorplan_edit",
      ],
      live_anchor: ["anchor_edit", "anchor_delete", "binding_edit"],
      live_room: [],
      placement: ["upload"],
      editing_workflow: [
        "task_create",
        "source_upload",
        "task_claim",
        "task_assign",
        "edited_upload",
        "review",
        "publish",
        "task_manage",
        "cover_manage",
        "material_upload",
        "material_organize",
        "material_delete",
      ],
      software_library: ["item_edit", "item_delete"],
      recording: ["task_manage", "file_delete"],
      people_performance: [],
      business_recruitment: ["candidate_edit", "operation_review", "signing_manage"],
      courses: [],
    });
  });

  it("admin=true 追加的点", () => {
    expect(
      translateLegacyPoints("live_account", { edit: false, export: false, admin: true }),
    ).toEqual(["delete_review", "session_correct"]);
    expect(
      translateLegacyPoints("editing_workflow", { edit: false, export: false, admin: true }),
    ).toEqual(["task_delete"]);
    expect(
      translateLegacyPoints("permissions", { edit: false, export: false, admin: true }),
    ).toEqual(["manage_roles", "manage_overrides", "manage_dept_leaders", "invite_codes"]);
    expect(
      translateLegacyPoints("people_performance", { edit: false, export: false, admin: true }),
    ).toEqual(["manage_profiles", "manage_process", "calibrate"]);
  });

  it("export=true 只给 dashboard/anchors 的 export 点", () => {
    expect(translateLegacyPoints("dashboard", { edit: false, export: true, admin: false })).toEqual(
      ["export"],
    );
    expect(translateLegacyPoints("anchors", { edit: false, export: true, admin: false })).toEqual([
      "export",
    ]);
    expect(translateLegacyPoints("crawler", { edit: false, export: true, admin: false })).toEqual(
      [],
    );
  });

  it("翻译产出的每个点都在注册表里（防拼写漂移）", () => {
    for (const m of MODULE_KEYS) {
      const all = translateLegacyPoints(m as ModuleKey, { edit: true, export: true, admin: true });
      const registered = new Set(MODULE_POINTS[m as ModuleKey].map((p) => p.key));
      for (const pt of all) {
        expect(registered.has(pt), `${m}.${pt} 不在 MODULE_POINTS 注册表`).toBe(true);
      }
    }
  });

  it("注册表总点数 = 52", () => {
    const total = Object.values(MODULE_POINTS).reduce((s, pts) => s + pts.length, 0);
    expect(total).toBe(52);
  });
});
