import { redirect } from "next/navigation";

import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { getPerformanceScoreStatistics } from "@/modules/people-performance/server";

import { PerformanceStatisticsClient } from "./_components/performance-statistics-client";

export default async function PerformanceStatisticsPage() {
  const identity = await getCurrentDingtalkUser();
  if (identity.kind === "unauth") redirect("/login");
  if (identity.kind === "user_not_synced") {
    return <div className="p-8 text-sm text-muted-foreground">当前钉钉账号未同步。</div>;
  }

  const rows = await getPerformanceScoreStatistics();
  return <PerformanceStatisticsClient rows={rows} />;
}
