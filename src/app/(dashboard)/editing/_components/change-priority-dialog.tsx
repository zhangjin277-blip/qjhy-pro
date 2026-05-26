"use client";
import { useState } from "react";
import { setPriority } from "@/modules/editing-task";
import { toast } from "sonner";

interface Props {
  taskId: number;
  currentPriority: "normal" | "urgent";
}

export function ChangePriorityDialog({ taskId, currentPriority }: Props) {
  const [open, setOpen] = useState(false);
  const [priority, setP] = useState<"normal" | "urgent">(currentPriority);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded border border-border px-3 py-1.5 text-sm hover:border-red-500 hover:text-red-600"
      >
        调整优先级
      </button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex gap-3 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={priority === "normal"} onChange={() => setP("normal")} />
          正常
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={priority === "urgent"} onChange={() => setP("urgent")} />
          <span className="text-red-600">🔴 紧急</span>
        </label>
      </div>
      {priority === "urgent" && (
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="紧急原因（可选）"
          rows={2}
          className="rounded border border-border px-2 py-1 text-sm"
        />
      )}
      <div className="flex gap-2">
        <button
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            try {
              await setPriority({
                taskId,
                priority,
                urgentReason: priority === "urgent" ? reason.trim() || null : null,
              });
              toast.success("已更新优先级");
              location.reload();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "操作失败");
            } finally {
              setLoading(false);
            }
          }}
          className="rounded bg-blue-500 px-3 py-1.5 text-sm text-white disabled:opacity-60"
        >
          {loading ? "保存中..." : "确认"}
        </button>
        <button onClick={() => setOpen(false)} className="text-sm text-slate-500">
          取消
        </button>
      </div>
    </div>
  );
}
