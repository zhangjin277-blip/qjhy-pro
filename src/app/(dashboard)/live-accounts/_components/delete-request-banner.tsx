"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewAccountDeletion, type DeleteImpact } from "@/modules/live-account";

export interface DeleteRequestItem {
  id: string;
  account_name: string;
  product: string;
  reason: string | null;
  impact: DeleteImpact;
  requested_by_name: string;
  requested_at: string; // 已格式化
}

function impactStr(i: DeleteImpact): string {
  return `剪辑任务 ${i.editing_tasks} · 开播记录 ${i.live_sessions} · 投放 ${i.placement_rows} · 排班 ${i.schedule_items} · 绑定 ${i.anchor_bindings}`;
}

/** 管理员可见：待审核的账号删除申请（批准即执行删除）。 */
export function DeleteRequestBanner({ requests }: { requests: DeleteRequestItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const review = (req: DeleteRequestItem, approve: boolean) => {
    let note: string | null = null;
    if (approve) {
      if (
        !confirm(
          `批准删除「${req.account_name}」？\n\n将连带删除：${impactStr(req.impact)}\n\n此操作不可恢复。`,
        )
      )
        return;
    } else {
      note = prompt(`驳回「${req.account_name}」的删除申请，理由（选填）：`);
      if (note === null) return; // 取消
    }
    startTransition(async () => {
      const r = await reviewAccountDeletion({ requestId: req.id, approve, note: note || null });
      if (!r.ok) alert(r.error);
      router.refresh();
    });
  };

  if (requests.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div className="mb-2 text-sm font-semibold text-amber-800">
        待审核删除申请（{requests.length}）
      </div>
      <div className="space-y-2">
        {requests.map((req) => (
          <div
            key={req.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-white px-3 py-2 text-sm shadow-sm"
          >
            <span className="font-medium text-slate-800">
              {req.account_name}
              <span className="ml-1 text-xs text-slate-400">{req.product}</span>
            </span>
            <span className="text-slate-500">
              {req.requested_by_name} · {req.requested_at}
            </span>
            {req.reason ? <span className="text-slate-500">理由：{req.reason}</span> : null}
            <span className="text-xs text-slate-400">{impactStr(req.impact)}</span>
            <span className="ml-auto flex gap-2">
              <button
                disabled={pending}
                onClick={() => review(req, false)}
                className="rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                驳回
              </button>
              <button
                disabled={pending}
                onClick={() => review(req, true)}
                className="rounded bg-red-600 px-2.5 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50"
              >
                批准删除
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
