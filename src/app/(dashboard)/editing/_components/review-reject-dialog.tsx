"use client";
import { useState } from "react";
import { reviewReject } from "@/modules/editing-task";
import { toast } from "sonner";

interface Props {
  taskId: number;
  onBeforeReject?: () => Promise<void>;
  onDone?: () => void;
}

export function ReviewRejectDialog({ taskId, onBeforeReject, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded border border-amber-500 px-3 py-1.5 text-sm text-amber-600 hover:bg-amber-50"
      >
        审核回退
      </button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="回退原因（例：画质不清晰 / 字幕有误 / 节奏不对）"
        rows={2}
        className="w-full rounded border border-border px-2 py-1 text-sm"
      />
      <div className="flex gap-2">
        <button
          disabled={!reason.trim()}
          onClick={async () => {
            try {
              if (onBeforeReject) await onBeforeReject();
              await reviewReject({ taskId, reason: reason.trim() });
              toast.success("已回退");
              onDone?.();
              location.reload();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "回退失败");
            }
          }}
          className="rounded bg-amber-500 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          提交回退
        </button>
        <button onClick={() => setOpen(false)} className="text-sm text-slate-500">
          取消
        </button>
      </div>
    </div>
  );
}
