import { redirect } from "next/navigation";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import { BuyuProjectHub } from "./_components/buyu-project-hub";

export default async function BuyuProjectPage(): Promise<React.JSX.Element> {
  const identity = await getCurrentDingtalkUser();
  if (identity.kind === "unauth") redirect("/login");
  if (identity.kind === "user_not_synced") redirect("/dashboard");
  if (!identity.isEmergency) {
    const permission = await resolvePermission(identity.dingtalkUserId, "project_buyu");
    if (permission.scope === "none") redirect("/dashboard");
  }
  return <BuyuProjectHub />;
}
