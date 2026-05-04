import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DashboardBoard } from "./_components/dashboard-board";

export default async function DashboardPage(): Promise<React.JSX.Element> {
  // auth 检查（与 layout 的检查冗余但有显式语义；layout 已 redirect 但留作保险）
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">业务看板</h1>
      <DashboardBoard />
    </div>
  );
}
