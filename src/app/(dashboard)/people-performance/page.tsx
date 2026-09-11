import { redirect } from "next/navigation";
import Link from "next/link";
import { BarChart3 } from "lucide-react";

import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import {
  listPeoplePerformance,
  listPerformanceManagerOptions,
} from "@/modules/people-performance/server";
import { resolvePermission } from "@/modules/permissions/server";

import { PeoplePerformanceClient } from "./_components/people-performance-client";

export default async function PeoplePerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>;
}) {
  const identity = await getCurrentDingtalkUser();
  if (identity.kind === "unauth") redirect("/login");
  if (identity.kind === "user_not_synced") {
    return <div className="p-8 text-sm text-muted-foreground">当前钉钉账号未同步。</div>;
  }
  let canManageProfiles = identity.isEmergency;
  let canManageProcess = identity.isEmergency;
  if (!identity.isEmergency) {
    const permission = await resolvePermission(identity.dingtalkUserId, "people_performance");
    if (permission.scope === "none" && permission.points.size === 0) {
      return <div className="p-8 text-sm text-muted-foreground">暂无人员绩效板块权限。</div>;
    }
    canManageProfiles = permission.points.has("manage_profiles");
    canManageProcess = permission.points.has("manage_process");
  }
  const [rows, managerOptions, params] = await Promise.all([
    listPeoplePerformance(),
    canManageProfiles ? listPerformanceManagerOptions() : Promise.resolve([]),
    searchParams,
  ]);
  return (
    <div className="min-w-0 max-w-full space-y-3 px-1 py-1 md:px-1.5 md:py-1.5">
      <div className="flex items-center justify-between border-b border-slate-200 pb-1">
        <span className="mr-2 px-3 py-1.5 text-sm font-semibold text-slate-700">人员绩效</span>
        <Link
          href="/people-performance/statistics"
          className="mr-2 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-slate-700 hover:border-blue-300 hover:bg-blue-50"
        >
          <BarChart3 className="size-4" />
          统计分析
        </Link>
      </div>
      <PeoplePerformanceClient
        initialRows={rows}
        initialUserId={params.user ?? null}
        canManageProfiles={canManageProfiles}
        canManageProcess={canManageProcess}
        managerOptions={managerOptions}
      />
    </div>
  );
}
