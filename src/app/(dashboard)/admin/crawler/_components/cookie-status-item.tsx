import { cn } from "@/lib/utils/cn";
import { COLLECTION_GUIDES } from "../_lib/collection-guide";

export interface CookieRow {
  basecamp: string;
  status: string;
  expires_at: string | null;
  last_check_at: string | null;
}

const COOKIE_LABEL: Record<string, string> = {
  cs: "抖音·百应主账号",
  nc1: "抖音·百应 NC1",
  nc2: "抖音·百应 NC2",
  kuaishou: "快手机构后台",
  kuaishou_creator: "快手创作者中心",
  douyin_creator: "抖音创作者·孙小圣",
  douyin_creator_xiao_mowan: "抖音创作者·小魔丸",
  wechat_creator: "视频号创作者中心",
  bilibili_creator: "B站创作中心",
  xiaohongshu_creator: "小红书创作平台",
  lingji: "抖音·灵机官号",
};

function formatCredentialTime(value: string | null): string {
  if (!value) return "暂无状态更新时间";
  return `状态更新 ${new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function CookieStatusItem({ item }: { item: CookieRow }): React.JSX.Element {
  const active = item.status === "active";
  const guide = COLLECTION_GUIDES[item.basecamp];
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-slate-800">
          {COOKIE_LABEL[item.basecamp] ?? item.basecamp}
        </p>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-1 text-[11px]",
            active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600",
          )}
        >
          {active ? "有效" : "已失效"}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-5 text-slate-400">
        {formatCredentialTime(item.last_check_at)}
        {item.expires_at
          ? ` · 参考到期 ${new Date(item.expires_at).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}`
          : ""}
      </p>
      {guide ? (
        <>
          <p className="mt-3 text-xs leading-5 text-slate-600">{guide.purpose}</p>
          <div className="mt-3 rounded-lg bg-blue-50/70 px-3 py-2">
            <p className="text-[11px] font-medium text-blue-700">自动采集 · 北京时间</p>
            <p className="mt-1 text-xs leading-5 text-blue-900">{guide.schedule}</p>
          </div>
          <details className="group mt-3 border-t border-slate-100 pt-3">
            <summary className="cursor-pointer text-xs font-medium text-blue-600 hover:text-blue-800">
              用途与采集明细（{guide.tasks.length} 项）
            </summary>
            <div className="mt-3 space-y-3 text-xs leading-5 text-slate-600">
              <div>
                <p className="font-semibold text-slate-700">影响的业务页面</p>
                <p>{guide.pages}</p>
              </div>
              <ol className="space-y-3">
                {guide.tasks.map((task, index) => (
                  <li
                    key={task.name}
                    className="rounded-lg border border-slate-100 bg-slate-50/60 p-3"
                  >
                    <p className="font-semibold text-slate-800">
                      {index + 1}. {task.name}
                    </p>
                    <p className="mt-1 text-blue-700">{task.schedule}</p>
                    <p className="mt-1">{task.purpose}</p>
                    <p className="mt-1">
                      <span className="font-medium text-slate-700">采集范围：</span>
                      {task.scope}
                    </p>
                  </li>
                ))}
              </ol>
              <div>
                <p className="font-semibold text-slate-700">异常恢复与补采</p>
                <p>{guide.recovery}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-700">管理提示</p>
                <ul className="list-disc space-y-1 pl-4">
                  {guide.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
        </>
      ) : (
        <p className="mt-3 text-xs text-slate-500">此凭证的采集用途与自动计划待确认。</p>
      )}
    </div>
  );
}
