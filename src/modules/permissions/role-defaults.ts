import { MODULE_KEYS, type ModuleKey } from "./modules";
import type { Scope } from "./types";

/**
 * 旧三布尔 → 权限点翻译规则（与 0054 迁移 SQL 的 _translate_points 一致）。
 * 原则：现状行为等价——原来 can_edit 能做的操作，翻译后对应点全给。
 * 单测 tests/modules/permissions/role-defaults.test.ts 以此为快照基准。
 */
export function translateLegacyPoints(
  module: ModuleKey,
  flags: { edit: boolean; export: boolean; admin: boolean },
): string[] {
  const pts: string[] = [];
  switch (module) {
    case "project_zhaohua":
      if (flags.edit) pts.push("project_edit");
      break;
    case "dashboard":
    case "anchors":
      if (flags.export) pts.push("export");
      break;
    case "crawler":
      if (flags.edit) pts.push("run_jobs", "cookie_update", "field_alias");
      break;
    case "permissions":
      if (flags.admin)
        pts.push("manage_roles", "manage_overrides", "manage_dept_leaders", "invite_codes");
      break;
    case "live_account":
      if (flags.edit)
        pts.push(
          "account_edit",
          "delete_request",
          "schedule_edit",
          "room_edit",
          "room_delete",
          "floorplan_edit",
        );
      if (flags.admin) pts.push("delete_review", "session_correct");
      break;
    case "live_anchor":
      if (flags.edit) pts.push("anchor_edit", "anchor_delete", "binding_edit");
      break;
    case "placement":
      if (flags.edit) pts.push("upload");
      break;
    case "editing_workflow":
      if (flags.edit)
        pts.push(
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
        );
      if (flags.admin) pts.push("task_delete");
      break;
    case "software_library":
      if (flags.edit) pts.push("item_edit", "item_delete");
      break;
    case "recording":
      if (flags.edit) pts.push("task_manage", "file_delete");
      break;
    case "people_performance":
      if (flags.admin) pts.push("manage_profiles", "manage_process", "calibrate");
      break;
    case "business_recruitment":
      if (flags.edit) pts.push("candidate_edit", "operation_review", "signing_manage");
      if (flags.admin) pts.push("demand_manage");
      break;
    case "live_room":
      break; // 无自有权限点（操作判 live_account）
  }
  return pts;
}

interface SeedBase {
  position: string;
  scope: Scope;
  edit: boolean;
  export: boolean;
  admin: boolean;
  description: string;
}

/**
 * 岗位 × 板块默认权限初始 seed（新部署用；存量库走 0054 迁移翻译）。
 * 语义与三布尔时代一致，经 translateLegacyPoints 转成权限点。
 */
const POSITION_BASE: SeedBase[] = [
  {
    position: "总监",
    scope: "all",
    edit: true,
    export: true,
    admin: true,
    description: "看所有数据，可管理",
  },
  {
    position: "老板",
    scope: "all",
    edit: true,
    export: true,
    admin: true,
    description: "看所有数据，可管理",
  },
  {
    position: "运营",
    scope: "self",
    edit: true,
    export: false,
    admin: false,
    description: "看自己负责主播",
  },
  {
    position: "商务",
    scope: "none",
    edit: false,
    export: false,
    admin: false,
    description: "默认仅开通商务招募",
  },
  {
    position: "线上商务",
    scope: "none",
    edit: false,
    export: false,
    admin: false,
    description: "默认仅开通商务招募",
  },
  {
    position: "主播",
    scope: "self",
    edit: false,
    export: false,
    admin: false,
    description: "看自己作为主播的数据",
  },
  {
    position: "剪辑",
    scope: "self",
    edit: false,
    export: false,
    admin: false,
    description: "看自己负责主播",
  },
  {
    position: "行政",
    scope: "none",
    edit: false,
    export: false,
    admin: false,
    description: "默认无权限",
  },
  {
    position: "财务",
    scope: "none",
    edit: false,
    export: true,
    admin: false,
    description: "默认无权限，按需开导出",
  },
  {
    position: "其他",
    scope: "none",
    edit: false,
    export: false,
    admin: false,
    description: "兜底",
  },
];

export const ROLE_DEFAULTS_SEED: {
  position: string;
  module: ModuleKey;
  scope: Scope;
  points: string[];
  description: string;
}[] = POSITION_BASE.flatMap((row) =>
  MODULE_KEYS.map((module) => {
    const isBoss = row.position === "总监" || row.position === "老板";
    if (module === "business_recruitment") {
      const isBusiness = row.position === "商务" || row.position === "线上商务";
      const isOperator = row.position === "运营";
      return {
        position: row.position,
        module,
        scope: isBoss
          ? ("all" as const)
          : isBusiness || isOperator
            ? ("self" as const)
            : ("none" as const),
        points: isBoss
          ? ["candidate_edit", "operation_review", "signing_manage"]
          : isBusiness
            ? ["candidate_edit"]
            : isOperator
              ? ["operation_review", "signing_manage"]
              : [],
        description: isBoss
          ? "商务招募全流程管理"
          : isBusiness
            ? "登记并维护本人招募的候选人"
            : isOperator
              ? "复评并跟进分配给本人的候选人"
              : "默认无权限",
      };
    }
    // 软件库/直播录制：全员可见可下载（scope=all）；写操作仅总监/老板（沿革见 0055/0056 种子）
    if (module === "software_library") {
      return {
        position: row.position,
        module,
        scope: "all" as const,
        points: translateLegacyPoints(module, { edit: isBoss, export: false, admin: isBoss }),
        description: "软件库：全员可下载，管理员可上传",
      };
    }
    if (module === "recording") {
      return {
        position: row.position,
        module,
        scope: "all" as const,
        points: translateLegacyPoints(module, { edit: isBoss, export: false, admin: isBoss }),
        description: "直播录制：全员可看可下载，管理员可控制/删文件",
      };
    }
    if (module === "people_performance") {
      const isHr = row.position === "行政";
      return {
        position: row.position,
        module,
        scope: isBoss || isHr ? ("all" as const) : ("self" as const),
        points: isBoss || isHr ? ["manage_profiles", "manage_process", "calibrate"] : [],
        description: isBoss || isHr ? "人员绩效全流程管理" : "查看并处理本人绩效",
      };
    }
    return {
      position: row.position,
      module,
      scope: row.scope,
      points: translateLegacyPoints(module, {
        edit: row.edit,
        export: row.export,
        admin: row.admin,
      }),
      description: row.description,
    };
  }),
);
