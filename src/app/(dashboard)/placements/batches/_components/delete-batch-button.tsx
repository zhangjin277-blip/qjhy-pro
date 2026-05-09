"use client";

import { useState, useTransition } from "react";
import { deleteBatchAction } from "../../actions";

export function DeleteBatchButton({
  batchId,
  fileName,
  source,
}: {
  batchId: string;
  fileName: string | null;
  source: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    const label = fileName ?? batchId.slice(0, 8);
    const sourceLabel = source === "excel-upload" ? "Excel" : "PRO3 迁移";
    if (
      !confirm(
        `确认删除 [${sourceLabel}] ${label} ?\n\n` +
          `excel-upload：会删除该 batch 的累计原始值，并重算受影响的 (账号, 日期) 全天增量。\n` +
          `pro3-migration：会直接删除该 batch 写入的所有 placement_row。\n\n此操作不可撤销。`,
      )
    ) {
      return;
    }
    setError(null);
    start(async () => {
      try {
        await deleteBatchAction(batchId);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onClick}
        disabled={pending}
        className="text-xs text-red-600 hover:text-red-700 hover:underline disabled:text-slate-300"
      >
        {pending ? "删除中…" : "删除"}
      </button>
      {error && <span className="text-[11px] text-red-500">{error}</span>}
    </div>
  );
}
