import { cn } from "@/lib/utils/cn";
import { DINGTALK_SYNC_GUIDES } from "../_lib/dingtalk-sync-guide";

export function DingTalkSyncPanel(): React.JSX.Element {
  const projects = Array.from(new Set(DINGTALK_SYNC_GUIDES.map((item) => item.project)));
  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">钉钉与业务同步</h2>
          <p className="mt-1 text-xs text-slate-500">
            这些任务不依赖
            Cookie，按板块项目查看授权方式、自动时间、数据范围和补同步入口。时间均为北京时间（UTC+8）。
          </p>
        </div>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
          {DINGTALK_SYNC_GUIDES.length} 项同步
        </span>
      </div>
      <div className="space-y-4">
        {projects.map((project) => {
          const rows = DINGTALK_SYNC_GUIDES.filter((item) => item.project === project);
          return (
            <div key={project} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">{project}</h3>
              <div className="grid gap-2 xl:grid-cols-2">
                {rows.map((item) => (
                  <article
                    key={item.key}
                    className="rounded-lg border border-slate-200 bg-white p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="text-sm font-medium text-slate-800">{item.name}</h4>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[11px]",
                          item.statusTone === "amber"
                            ? "bg-amber-50 text-amber-700"
                            : item.statusTone === "green"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-blue-50 text-blue-700",
                        )}
                      >
                        {item.statusLabel}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-600">{item.purpose}</p>
                    <dl className="mt-3 grid gap-x-3 gap-y-1 text-[11px] leading-5 text-slate-500 sm:grid-cols-[auto_1fr]">
                      <dt className="text-slate-400">自动计划</dt>
                      <dd>{item.schedule}</dd>
                      <dt className="text-slate-400">数据范围</dt>
                      <dd>{item.window}</dd>
                      <dt className="text-slate-400">数据来源</dt>
                      <dd>{item.source}</dd>
                      <dt className="text-slate-400">补同步</dt>
                      <dd>{item.recovery}</dd>
                    </dl>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
