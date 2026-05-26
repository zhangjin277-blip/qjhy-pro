"use client";
import { useState, useRef, useEffect } from "react";
import { assignEditor } from "@/modules/editing-task";
import { toast } from "sonner";

interface Props {
  taskId: number;
  editors: { userId: string; name: string }[];
}

export function QuickAssignChip({ taskId, editors }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  async function assign(editorUserId: string) {
    try {
      await assignEditor({ taskIds: [taskId], editorUserId });
      toast.success("已派单");
      location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "派单失败");
    }
  }

  return (
    <span ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="rounded border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-500 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-600"
      >
        + 派单
      </button>
      {open && (
        <div className="absolute top-full left-0 z-30 mt-1 max-h-60 min-w-[140px] overflow-auto rounded-md border border-border bg-white p-1 shadow-lg">
          {editors.length === 0 ? (
            <p className="p-2 text-xs text-slate-400">无剪辑师可派</p>
          ) : (
            editors.map((e) => (
              <button
                key={e.userId}
                onClick={(ev) => {
                  ev.stopPropagation();
                  setOpen(false);
                  assign(e.userId);
                }}
                className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-blue-50 hover:text-blue-600"
              >
                {e.name}
              </button>
            ))
          )}
        </div>
      )}
    </span>
  );
}
