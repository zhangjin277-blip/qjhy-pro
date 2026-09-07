import "server-only";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import {
  getDashboardOverview,
  getDrawerDetail,
  resolveDashboardScope,
  type DashboardScope,
} from "@/modules/dashboard/server";
import {
  toMiniProgramDashboard,
  toMiniProgramMetricDetail,
  type MiniProgramDashboardResponse,
  type MiniProgramMetricDetailResponse,
  type MiniProgramMetricKey,
} from "./index";
import type { ProjectKey } from "@/modules/dashboard";

type MiniProgramIdentity =
  | { kind: "ok"; dingtalkUserId: string; isEmergency: boolean }
  | { kind: "unauth" }
  | { kind: "user_not_synced" };

export async function resolveMiniProgramIdentity(
  request: NextRequest,
): Promise<MiniProgramIdentity> {
  const webIdentity = await getCurrentDingtalkUser();
  if (webIdentity.kind === "ok") return webIdentity;

  const configuredDevUser = env.MINIPROGRAM_DEV_USER_ID.trim();
  const requestedDevUser = request.headers.get("x-miniprogram-dev-user")?.trim();
  if (
    env.NODE_ENV !== "production" &&
    configuredDevUser.length > 0 &&
    requestedDevUser === configuredDevUser
  ) {
    return { kind: "ok", dingtalkUserId: configuredDevUser, isEmergency: false };
  }

  return webIdentity.kind === "user_not_synced" ? { kind: "user_not_synced" } : { kind: "unauth" };
}

export async function getMiniProgramDashboard(
  date: string,
  identity: Extract<MiniProgramIdentity, { kind: "ok" }>,
): Promise<MiniProgramDashboardResponse> {
  let scope: DashboardScope;
  if (identity.isEmergency) {
    scope = { kind: "all" };
  } else {
    scope = await resolveDashboardScope(identity.dingtalkUserId);
  }
  const overview = await getDashboardOverview(date, date, scope);
  return toMiniProgramDashboard(overview);
}

export async function getMiniProgramMetricDetail(
  date: string,
  project: ProjectKey,
  metric: MiniProgramMetricKey,
  identity: Extract<MiniProgramIdentity, { kind: "ok" }>,
): Promise<MiniProgramMetricDetailResponse> {
  const scope: DashboardScope = identity.isEmergency
    ? { kind: "all" }
    : await resolveDashboardScope(identity.dingtalkUserId);
  const detail = await getDrawerDetail(
    {
      date_from: date,
      date_to: date,
      project,
      group: "all",
      metric,
    },
    scope,
  );
  return toMiniProgramMetricDetail(detail, date, project, metric);
}
