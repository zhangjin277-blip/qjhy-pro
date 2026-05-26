"use client";
import { useState } from "react";
import { assignEditor } from "@/modules/editing-task";
import type { EditorOption } from "@/modules/editing-editor";
import { toast } from "sonner";

interface Props {
  editors: EditorOption[];
  taskIds: number[];
  onDone?: () => void;
}

export function AssignPopover({ editors, taskIds, onDone }: Props) {
  const [editor, setEditor] = useState<string>("");
  return (
    <div className="flex items-center gap-2">
      <select
        value={editor}
        onChange={(e) => setEditor(e.target.value)}
        className="rounded border border-border px-2 py-1.5 text-sm"
      >
        <option value="">选剪辑师</option>
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
            await assignEditor({ taskIds, editorUserId: editor });
            toast.success("已派单");
            onDone?.();
            location.reload();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "派单失败");
          }
        }}
        className="rounded bg-blue-500 px-3 py-1.5 text-sm text-white disabled:opacity-50 hover:bg-blue-600"
      >
        派单
      </button>
    </div>
  );
}
