import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { dingtalk_user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getBrokerAggregates } from "@/modules/dashboard/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

export default async function BrokersPage(): Promise<React.JSX.Element> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  // Resolve dingtalk user_id from session (same pattern as profile page)
  const isEmergency = session.user.email === "emergency@qjhy.local";
  let dingtalkUserId: string;

  if (isEmergency) {
    dingtalkUserId = session.user.id;
  } else {
    const [du] = await db
      .select({ user_id: dingtalk_user.user_id })
      .from(dingtalk_user)
      .where(eq(dingtalk_user.unionid, session.user.id));
    if (!du) {
      return (
        <div className="p-6">
          <p className="text-muted-foreground text-sm">用户尚未同步到组织架构表，无法加载数据。</p>
        </div>
      );
    }
    dingtalkUserId = du.user_id;
  }

  const rows = await getBrokerAggregates(dingtalkUserId, yesterday);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">经纪人聚合</h1>
      <div className="bg-card rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>经纪人</TableHead>
              <TableHead>钉钉用户</TableHead>
              <TableHead className="text-right">主播数</TableHead>
              <TableHead className="text-right">总音浪</TableHead>
              <TableHead className="text-right">总时长 (h)</TableHead>
              <TableHead className="text-right">平均健康分</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.broker_id}>
                <TableCell>{r.broker_name}</TableCell>
                <TableCell>{r.user_name ?? "—"}</TableCell>
                <TableCell className="text-right">{r.anchor_count}</TableCell>
                <TableCell className="text-right">{r.total_fan_ticket.toLocaleString()}</TableCell>
                <TableCell className="text-right">{r.total_duration.toFixed(1)}</TableCell>
                <TableCell className="text-right">{r.avg_health_score ?? "—"}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  无数据
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
