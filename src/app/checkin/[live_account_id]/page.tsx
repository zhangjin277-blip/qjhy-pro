import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCheckinState } from "@/modules/checkin/server";
import { CheckinClient } from "./_components/checkin-client";

export const dynamic = "force-dynamic";

/** Tailwind v4 要求 Safari 16.4+；老 iOS 跳到 vanilla HTML 简版避免白屏 */
function isOldIosSafari(ua: string): boolean {
  const m = ua.match(/(?:iPhone|iPad|iPod).*OS (\d+)_(\d+)/);
  if (!m || !m[1] || !m[2]) return false;
  const major = parseInt(m[1], 10);
  const minor = parseInt(m[2], 10);
  if (major > 16) return false;
  if (major < 16) return true;
  return minor < 4;
}

export default async function CheckinPage({
  params,
}: {
  params: Promise<{ live_account_id: string }>;
}): Promise<React.JSX.Element> {
  const { live_account_id } = await params;
  const hdrs = await headers();
  const ua = hdrs.get("user-agent") ?? "";
  if (isOldIosSafari(ua)) {
    redirect(`/checkin/${live_account_id}/simple`);
  }
  const session = await auth.api.getSession({ headers: hdrs });
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
  if (state.account.deprecated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="text-center text-slate-500">
          <div className="text-[20px] font-semibold text-slate-700">该账号已废弃</div>
          <div className="mt-2 text-[14px]">
            {state.account.placement_label || state.account.account_name} 已停止使用，不能开播
          </div>
        </div>
      </div>
    );
  }
  return <CheckinClient initialState={state} liveAccountId={live_account_id} />;
}
