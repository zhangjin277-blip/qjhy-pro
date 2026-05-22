import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCheckinState } from "@/modules/checkin/server";
import { CheckinClient } from "./_components/checkin-client";

export const dynamic = "force-dynamic";

export default async function CheckinPage({
  params,
}: {
  params: Promise<{ live_account_id: string }>;
}): Promise<React.JSX.Element> {
  const { live_account_id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect(`/login?next=${encodeURIComponent(`/checkin/${live_account_id}`)}`);
  }
  const state = await getCheckinState(live_account_id);
  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="text-center text-slate-500">
          <div className="text-[20px] font-semibold text-slate-700">账号不存在</div>
          <div className="mt-2 text-[14px]">live_account_id: {live_account_id}</div>
        </div>
      </div>
    );
  }
  return <CheckinClient initialState={state} liveAccountId={live_account_id} />;
}
