import { redirect } from "next/navigation";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import { BuyuProjectHub } from "./_components/buyu-project-hub";

export default async function BuyuProjectPage(): Promise<React.JSX.Element> {
  const identity = await getCurrentDingtalkUser();
  if (identity.kind === "unauth") redirect("/login");
  if (identity.kind === "user_not_synced") redirect("/dashboard");
  let canManualPlacementPull = identity.isEmergency;
  if (!identity.isEmergency) {
    const permission = await resolvePermission(identity.dingtalkUserId, "project_buyu");
    if (permission.scope === "none") redirect("/dashboard");
    const placementPermission = await resolvePermission(identity.dingtalkUserId, "placement");
    canManualPlacementPull = placementPermission.points.has("upload");
  }
  return <BuyuProjectHub canManualPlacementPull={canManualPlacementPull} />;
}
