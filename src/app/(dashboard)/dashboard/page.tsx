import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Workbench } from "./_components/workbench";

export default async function DashboardPage(): Promise<React.JSX.Element> {
  // auth 检查（与 layout 的检查冗余但有显式语义；layout 已 redirect 但留作保险）
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <div className="min-w-0 max-w-full space-y-3 px-1 py-1 md:px-1.5 md:py-1.5">
      <Workbench />
    </div>
  );
}
