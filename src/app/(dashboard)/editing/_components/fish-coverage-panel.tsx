"use client";
import type { FishCoverage } from "@/modules/editing-task";

interface Props {
  coverage: FishCoverage;
}

/** 今日完成度：进度环概览 + 只列「未上传要催的人」（变体 C） */
export function FishCoveragePanel({ coverage }: Props) {
  if (coverage.total === 0) return null;

  const pct = Math.round((coverage.uploaded / coverage.total) * 100);
  const allDone = coverage.missing === 0;

  // 未上传主播，按产品分组（去重）
  const missingByProduct = (() => {
    const m = new Map<string, string[]>();
    for (const it of coverage.items) {
      if (it.uploaded) continue;
      const name = it.anchorName ?? "未知";
      const arr = m.get(it.product) ?? [];
      if (!arr.includes(name)) arr.push(name);
      m.set(it.product, arr);
    }
    return Array.from(m.entries());
  })();

  return (
    <section className="h-full rounded-xl border border-border-subtle bg-white p-3">
      <div className="flex items-center gap-3.5">
        {/* 进度环 */}
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
          style={{ background: `conic-gradient(var(--primary) ${pct}%, #e9eef5 0)` }}
        >
          <div className="flex h-[42px] w-[42px] flex-col items-center justify-center rounded-full bg-white">
            <span className="text-[13px] font-bold leading-none tabular-nums text-slate-900">
              {coverage.uploaded}/{coverage.total}
            </span>
            <span className="mt-0.5 text-[8.5px] text-slate-400">已上传</span>
          </div>
        </div>
        <div className="min-w-0">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            今日完成度
          </h3>
          <div className="mt-1 text-[12px] text-slate-600">
            {allDone ? (
              <span className="font-medium text-green-700">全部上传完成</span>
            ) : (
              <>
                还有 <b className="text-[var(--change-up)] tabular-nums">{coverage.missing} 人</b>{" "}
                未上传 · 下面是要催的人
              </>
            )}
          </div>
        </div>
      </div>

      {!allDone && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {missingByProduct.map(([product, names]) => (
            <div key={product} className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10.5px] text-slate-400">{product}</span>
              {names.map((n) => (
                <span
                  key={n}
                  className="rounded-md bg-[#fff0f0] px-2 py-0.5 text-[11.5px] text-[#d92020]"
                >
                  {n}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
