import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { dingtalk_user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getDashboardCards } from "@/modules/dashboard/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

export default async function DashboardPage(): Promise<React.JSX.Element> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  // Resolve dingtalk user_id (same pattern as anchors API)
  const isEmergency = session.user.email === "emergency@qjhy.local";
  let dingtalkUserId: string;

  if (isEmergency) {
    dingtalkUserId = session.user.id;
  } else {
    const [du] = await db
      .select({ user_id: dingtalk_user.user_id })
      .from(dingtalk_user)
      .where(eq(dingtalk_user.unionid, session.user.id));
    if (!du) redirect("/login");
    dingtalkUserId = du.user_id;
  }

  const cards = await getDashboardCards(dingtalkUserId, yesterday);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">总览</h1>
      <p className="text-sm text-muted-foreground">数据日期：{yesterday}</p>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <CardItem title="今日总音浪" value={cards.total_fan_ticket_today.toLocaleString()} />
        <CardItem title="今日开播主播数" value={cards.active_anchors_today.toString()} />
        <CardItem title="小游戏总流水" value={cards.minigame_income_today.toLocaleString()} />
        <CardItem title="推广游戏总流水" value={cards.game_income_today.toLocaleString()} />
        <CardItem title="健康分异常" value={cards.health_warn_count.toString()} hint="< 60 分" />
      </div>
    </div>
  );
}

function CardItem({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}
