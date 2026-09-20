import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import { AiComicVideoDetail } from "../../douyin/[itemId]/_components/ai-comic-video-detail";

export default async function KuaishouAiComicVideoDetailPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}): Promise<React.JSX.Element> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const identity = await getCurrentDingtalkUser();
  if (identity.kind !== "ok") redirect("/login");
  if (!identity.isEmergency) {
    const permission = await resolvePermission(identity.dingtalkUserId, "project_ai_comic");
    if (permission.scope === "none" && permission.points.size === 0) redirect("/dashboard");
  }
  const { itemId } = await params;
  return <AiComicVideoDetail itemId={itemId} platform="kuaishou" />;
}
