import { db } from "@/db/client";
import {
  auth_permission_override,
  dept_leader,
  dingtalk_user,
  role_default_permission,
  user_position_override,
} from "@/db/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { isAppError } from "@/lib/errors";
import { MODULE_KEYS, type ModuleKey, type Scope } from "@/modules/permissions";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

const SCOPE_RANK: Record<Scope, number> = { none: 0, self: 1, team: 2, all: 3 };
const NULL_SCOPE: Scope = "none";

function maxScope(a: Scope, b: Scope): Scope {
  return SCOPE_RANK[a] >= SCOPE_RANK[b] ? a : b;
}

export async function GET() {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json(
      { error: isAppError(err) ? err.code : "AUTH_FORBIDDEN" },
      { status: isAppError(err) ? err.httpStatus : 403 },
    );
  }

  // 一次性批拉：避免 N+1（之前 146 × 4 module × 4 query → 把 PG pool 打爆）
  const [users, allRoleDefaults, allOverrides, allLeaderRows, allPosOverrides] = await Promise.all([
    db
      .select({
        user_id: dingtalk_user.user_id,
        name: dingtalk_user.name,
        title: dingtalk_user.title,
        dept_ids: dingtalk_user.dept_ids,
      })
      .from(dingtalk_user)
      .where(eq(dingtalk_user.active, true))
      .limit(500),
    db.select().from(role_default_permission),
    db.select().from(auth_permission_override),
    db.select({ user_id: dept_leader.user_id }).from(dept_leader),
    db
      .select({
        user_id: user_position_override.user_id,
        position: user_position_override.position,
      })
      .from(user_position_override),
  ]);

  const posOverrideMap = new Map(allPosOverrides.map((r) => [r.user_id, r.position]));

  // role default index: position → module → scope
  const roleIndex = new Map<string, Map<string, Scope>>();
  for (const r of allRoleDefaults) {
    let inner = roleIndex.get(r.position);
    if (!inner) {
      inner = new Map();
      roleIndex.set(r.position, inner);
    }
    inner.set(r.module, r.scope);
  }

  // override index: user_id → module → scope|null
  const overrideIndex = new Map<string, Map<string, Scope | null>>();
  const now = Date.now();
  for (const o of allOverrides) {
    if (o.expires_at && o.expires_at.getTime() < now) continue;
    let inner = overrideIndex.get(o.user_id);
    if (!inner) {
      inner = new Map();
      overrideIndex.set(o.user_id, inner);
    }
    inner.set(o.module, o.scope);
  }

  // dept_leader set
  const leaderSet = new Set(allLeaderRows.map((r) => r.user_id));

  const enriched = users.map((u) => {
    const position = posOverrideMap.get(u.user_id) ?? u.title ?? "其他";
    const isLeader = leaderSet.has(u.user_id);
    const userOverride = overrideIndex.get(u.user_id);

    const moduleScopes: Record<ModuleKey, Scope> = {} as Record<ModuleKey, Scope>;
    for (const m of MODULE_KEYS) {
      const roleScope =
        roleIndex.get(position)?.get(m) ?? roleIndex.get("其他")?.get(m) ?? NULL_SCOPE;
      const leaderScope: Scope = isLeader ? "team" : "none";
      const overrideScope = userOverride?.get(m) ?? null;

      let scope = maxScope(roleScope, leaderScope);
      if (overrideScope) scope = maxScope(scope, overrideScope);
      moduleScopes[m] = scope;
    }

    const dept_id = u.dept_ids[0] ?? null;
    const openedCount = MODULE_KEYS.filter((m) => moduleScopes[m] !== "none").length;

    return {
      ...u,
      dept_id,
      is_dept_leader: isLeader,
      assigned_position: posOverrideMap.get(u.user_id) ?? null,
      effective_position: position,
      module_scopes: moduleScopes,
      opened_count: openedCount,
      total_count: MODULE_KEYS.length,
    };
  });

  return NextResponse.json({ users: enriched });
}
