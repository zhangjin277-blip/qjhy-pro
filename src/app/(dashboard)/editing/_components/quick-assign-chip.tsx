"use client";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { assignEditor } from "@/modules/editing-task";
import { toast } from "sonner";

interface Props {
  taskId: number;
  editors: { userId: string; name: string }[];
}

export function QuickAssignChip({ taskId, editors }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; flipUp: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // 计算 popover 位置（fixed 浮在视口）
  useEffect(() => {
    if (!open) return;
    function compute() {
      if (!btnRef.current) return;
      const rect = btnRef.current.getBoundingClientRect();
      const popoverHeight = Math.min(editors.length * 32 + 8, 240); // 估算
      const spaceBelow = window.innerHeight - rect.bottom;
      const flipUp = spaceBelow < popoverHeight + 16;
      setPos({
        top: flipUp ? rect.top - popoverHeight - 4 : rect.bottom + 4,
        left: rect.left,
        flipUp,
      });
    }
    compute();
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [open, editors.length]);

  // 点外部关闭
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (popoverRef.current?.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
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
    <span className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="rounded border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-500 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-600"
      >
        + 派单
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={popoverRef}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                zIndex: 1000,
              }}
              className="max-h-60 min-w-[140px] overflow-auto rounded-md border border-border bg-white p-1 shadow-lg"
            >
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
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
