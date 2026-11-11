"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { MatrixPanel } from "./matrix-panel";
import { LogTable } from "./log-table";
import { COOKIE_GROUPS } from "../_lib/cookie-groups";
import { CookieStatusItem, type CookieRow } from "./cookie-status-item";
import { DingTalkSyncPanel } from "./dingtalk-sync-panel";

interface NotificationSetting {
  module_key: string;
  module_name: string;
  description: string | null;
  enabled: boolean;
  configured: boolean;
}

export function CrawlerControlPanel(): React.JSX.Element {
  const [cookies, setCookies] = useState<CookieRow[]>([]);
  const [settings, setSettings] = useState<NotificationSetting[]>([]);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "results" | "notifications">("overview");

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      const results = await Promise.allSettled([
        fetch("/api/admin/crawler/cookie").then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        }),
        fetch("/api/admin/crawler/notifications").then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        }),
      ]);
      if (cancelled) return;
      const [cookieResult, notificationResult] = results;
      if (cookieResult.status === "fulfilled") setCookies(cookieResult.value.cookies ?? []);
      else toast.error("采集凭证状态加载失败");
      if (notificationResult.status === "fulfilled") {
        setSettings(notificationResult.value.settings);
        setStorageReady(notificationResult.value.storageReady);
        setNotificationError(null);
      } else setNotificationError("通知配置加载失败，请刷新重试");
      setLoading(false);
    }
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const activeCookies = useMemo(
    () => cookies.filter((item) => item.status === "active").length,
    [cookies],
  );
  const expiredCookies = cookies.length - activeCookies;
  const enabledNotifications = settings.filter((item) => item.enabled).length;

  async function toggleNotification(item: NotificationSetting): Promise<void> {
    const enabled = !item.enabled;
    setSettings((current) =>
      current.map((row) => (row.module_key === item.module_key ? { ...row, enabled } : row)),
    );
    setSaving(item.module_key);
    try {
      const res = await fetch("/api/admin/crawler/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ moduleKey: item.module_key, enabled }),
      });
      if (!res.ok) throw new Error("保存失败");
      toast.success(`${item.module_name}通知已${enabled ? "开启" : "关闭"}`);
    } catch {
      setSettings((current) =>
        current.map((row) => (row.module_key === item.module_key ? item : row)),
      );
      toast.error("通知开关保存失败，请重试");
    } finally {
      setSaving(null);
    }
  }

  const tabButton = (key: typeof tab, label: string, count?: number): React.JSX.Element => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={cn(
        "rounded-lg px-4 py-2 text-sm",
        tab === key ? "bg-slate-900 font-semibold text-white" : "text-slate-500 hover:bg-slate-100",
      )}
    >
      {label}
      {count != null ? <span className="ml-1.5 text-xs opacity-70">{count}</span> : null}
    </button>
  );

  if (loading)
    return (
      <div className="rounded-xl border bg-white p-6 text-sm text-slate-400">采集配置加载中…</div>
    );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-1">
          {tabButton("overview", "总览")}
          {tabButton("results", "采集结果")}
          {tabButton("notifications", "通知管理", enabledNotifications)}
          <span className="ml-auto px-3 text-xs text-slate-400">数据每 30 秒自动刷新</span>
        </div>
      </div>

      {tab === "overview" && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="已配置采集凭证"
              value={`${cookies.length} 个`}
              detail={`${activeCookies} 个有效`}
              tone="blue"
            />
            <StatCard
              label="需要处理的凭证"
              value={`${expiredCookies} 个`}
              detail={expiredCookies ? "请尽快更新 Cookie" : "当前没有失效凭证"}
              tone={expiredCookies ? "red" : "green"}
            />
            <StatCard
              label="奇迹人通知"
              value={`${enabledNotifications} 个板块`}
              detail="可在通知管理中切换"
              tone="purple"
            />
          </div>
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">采集凭证状态</h2>
                <p className="mt-1 text-xs text-slate-500">
                  按项目查看采集用途、自动计划与补采方式。全部时间为北京时间（UTC+8）。
                </p>
              </div>
              <span className="text-xs text-slate-400">
                {activeCookies}/{cookies.length} 有效
              </span>
            </div>
            <div className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">
              自动计划表示任务触发时间，实际完成时间受排队和平台响应影响。页面每 30
              秒刷新状态，不代表每 30 秒采集。 凭证“有效”是系统登记状态，是否采集成功请结合“采集结果
              / 采集日志”确认。
            </div>
            <div className="space-y-4">
              {COOKIE_GROUPS.map((group) => {
                const rows = cookies.filter((item) => group.keys.includes(item.basecamp));
                if (rows.length === 0) return null;
                const valid = rows.filter((item) => item.status === "active").length;
                return (
                  <div
                    key={group.key}
                    className="rounded-xl border border-slate-100 bg-slate-50/50 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800">{group.label}</h3>
                        <p className="mt-0.5 text-[11px] text-slate-400">{group.description}</p>
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-2 py-1 text-[11px]",
                          valid === rows.length
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-600",
                        )}
                      >
                        {valid}/{rows.length} 有效
                      </span>
                    </div>
                    <div className="grid items-start gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {rows.map((item) => (
                        <CookieStatusItem key={item.basecamp} item={item} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          <DingTalkSyncPanel />
          <div className="grid gap-3 md:grid-cols-2">
            <InfoCard
              title="补采集入口"
              text="需要补历史数据时，进入“采集结果”，选择日期或单项任务即可重跑。"
              action="查看采集结果"
              onClick={() => setTab("results")}
            />
            <InfoCard
              title="机器人通知"
              text="这里统一管理哪些板块使用奇迹人提醒，Webhook 由服务端安全配置。"
              action="管理通知开关"
              onClick={() => setTab("notifications")}
            />
          </div>
        </>
      )}

      {tab === "results" && (
        <div className="space-y-4">
          <MatrixPanelSlot />
          <LogTableSlot />
        </div>
      )}

      {tab === "notifications" && (
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">奇迹人通知管理</h2>
              <p className="mt-1 text-xs text-slate-500">
                查看哪些板块正在使用机器人，并按板块独立开关。机器人地址由服务端环境变量管理。
              </p>
            </div>
            <span className="rounded-full bg-purple-50 px-2.5 py-1 text-xs text-purple-700">
              {enabledNotifications} / {settings.length} 已开启
            </span>
          </div>
          {notificationError && (
            <p role="alert" className="mb-4 text-sm text-red-600">
              {notificationError}
            </p>
          )}
          {!storageReady && (
            <p role="alert" className="mb-4 text-sm text-amber-700">
              通知配置表未就绪，当前展示默认状态；完成数据库迁移后可修改开关。
            </p>
          )}
          <div className="divide-y divide-slate-100">
            {settings.map((item) => (
              <div
                key={item.module_key}
                className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {item.module_name}
                    <span
                      className={cn(
                        "ml-2 text-xs font-normal",
                        item.configured ? "text-emerald-600" : "text-slate-400",
                      )}
                    >
                      {item.configured ? "机器人已配置" : "机器人未配置"}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{item.description}</p>
                </div>
                <button
                  type="button"
                  aria-pressed={item.enabled}
                  aria-label={`${item.module_name}通知`}
                  disabled={!storageReady || saving !== null}
                  onClick={() => void toggleNotification(item)}
                  className={cn(
                    "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                    item.enabled ? "bg-purple-600" : "bg-slate-200",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform",
                      item.enabled ? "left-6" : "left-1",
                    )}
                  />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "blue" | "red" | "green" | "purple";
}): React.JSX.Element {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={cn(
          "mt-2 text-2xl font-semibold",
          tone === "red"
            ? "text-red-600"
            : tone === "green"
              ? "text-emerald-600"
              : tone === "purple"
                ? "text-purple-600"
                : "text-blue-600",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-400">{detail}</p>
    </div>
  );
}

function InfoCard({
  title,
  text,
  action,
  onClick,
}: {
  title: string;
  text: string;
  action: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mt-2 text-xs leading-5 text-slate-500">{text}</p>
      <button
        type="button"
        onClick={onClick}
        className="mt-3 text-xs font-medium text-blue-600 hover:underline"
      >
        {action} →
      </button>
    </div>
  );
}

function MatrixPanelSlot(): React.JSX.Element {
  return <MatrixPanel />;
}
function LogTableSlot(): React.JSX.Element {
  return <LogTable />;
}
