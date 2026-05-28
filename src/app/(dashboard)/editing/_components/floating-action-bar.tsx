"use client";
import { useState } from "react";
import { useSelection } from "./selection-store";
import { assignEditor, deleteTask } from "@/modules/editing-task";
import { toast } from "sonner";

interface Props {
  editors: { userId: string; name: string }[];
}

export function FloatingActionBar({ editors }: Props) {
  const { selectedIds, clear } = useSelection();
  const [editor, setEditor] = useState<string>("");

  if (selectedIds.size === 0) return null;

  return (
    <div className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3.5 rounded-2xl bg-slate-800 px-4.5 py-2.5 text-white shadow-2xl">
      <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-sm font-semibold">
        已选 {selectedIds.size} 条
      </span>
      <div className="h-4 w-px bg-white/15" />
      <span className="text-sm text-white/85">派给</span>
      <select
        value={editor}
        onChange={(e) => setEditor(e.target.value)}
        className="rounded bg-white/12 px-2.5 py-1 text-sm text-white [&>option]:text-black"
      >
        <option value="">选择剪辑师</option>
        {editors.map((e) => (
          <option key={e.userId} value={e.userId}>
            {e.name}
          </option>
        ))}
      </select>
      <button
        disabled={!editor}
        onClick={async () => {
          try {
            const r = await assignEditor({
              taskIds: Array.from(selectedIds),
              editorUserId: editor,
            });
            toast.success(
              `已派单 ${r.updated} 条${r.skipped ? ` · 跳过 ${r.skipped} 条（状态不符）` : ""}`,
            );
            clear();
            location.reload();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "派单失败");
          }
        }}
        className="rounded bg-blue-500 px-3.5 py-1.5 text-sm font-medium disabled:opacity-50"
      >
        确认派单
      </button>
      <div className="h-4 w-px bg-white/15" />
      <button
        onClick={async () => {
          if (!confirm(`删除 ${selectedIds.size} 条任务？`)) return;
          try {
            const r = await deleteTask({ taskIds: Array.from(selectedIds) });
            toast.success(
              `已删除 ${r.deleted} 条${r.skipped ? ` · 跳过 ${r.skipped} 条（无权限/已发布）` : ""}`,
            );
            clear();
            location.reload();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "删除失败");
          }
        }}
        className="rounded border border-red-400/50 px-3.5 py-1.5 text-sm text-red-300 hover:bg-red-500/15"
      >
        批量删除
      </button>
      <button onClick={clear} className="px-2 text-sm text-white/70 hover:text-white">
        取消选择
      </button>
    </div>
  );
}
