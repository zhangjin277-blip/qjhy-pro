"use client";
import type { FishCoverage } from "@/modules/editing-task";

interface Props {
  coverage: FishCoverage;
}

export function FishCoveragePanel({ coverage }: Props) {
  if (coverage.total === 0) return null; // 今天没排班捕鱼系不显示

  const allDone = coverage.missing === 0;

  return (
    <div
      className={`rounded-xl border p-3 ${
        allDone ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          {allDone ? "✅ " : "⚠️ "}
          捕鱼系今日上传：{coverage.uploaded} / {coverage.total}
        </span>
        {!allDone && (
          <span className="text-xs text-amber-700">{coverage.missing} 个主播未上传</span>
        )}
      </div>
      {!allDone && (
        <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs md:grid-cols-3 lg:grid-cols-4">
          {coverage.items
            .filter((i) => !i.uploaded)
            .map((i) => (
              <li key={`${i.liveAccountId}-${i.anchorId ?? "none"}`} className="text-amber-800">
                · {i.liveAccountName}
                {i.anchorName && <span className="text-amber-600"> ({i.anchorName})</span>}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
