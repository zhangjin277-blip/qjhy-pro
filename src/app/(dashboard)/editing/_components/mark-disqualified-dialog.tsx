"use client";
import { useState } from "react";
import { toggleDisqualified } from "@/modules/editing-task";
import { toast } from "sonner";

export function MarkDisqualifiedDialog({
  taskId,
  onDone,
}: {
  taskId: number;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded border border-red-500 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
      >
        标记不合格
      </button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="原因（如：画面模糊 / 内容不符 / 音质差，可选）"
        rows={2}
        className="w-full rounded border px-2 py-1 text-sm"
      />
      <div className="flex gap-2">
        <button
          onClick={async () => {
            try {
              await toggleDisqualified({
                taskId,
                disqualified: true,
                reason: reason.trim() || null,
              });
              toast.success("已标记不合格");
              onDone?.();
              location.reload();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "标记失败");
            }
          }}
          className="rounded bg-red-500 px-3 py-1.5 text-sm text-white hover:bg-red-600"
        >
          确认标记
        </button>
        <button onClick={() => setOpen(false)} className="text-sm text-slate-500">
          取消
        </button>
      </div>
    </div>
  );
}
