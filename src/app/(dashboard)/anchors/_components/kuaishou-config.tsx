"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { KuaishouAnchorDetailDrawer } from "./kuaishou-anchor-detail-drawer";
import {
  KS_COLUMNS,
  KS_GROUPS,
  getKsColumnsByGroup,
  getKsColumnsBySubGroup,
  KS_DEFAULT_VISIBLE,
  type KuaishouColKey,
} from "./kuaishou-column-presets";
import type { AnchorFilters, KpiItemSpec, PlatformConfig, SystemPreset } from "./platform-config";
import type { ColumnDef } from "./column-presets";

/** 快手主播明细 row（与 KuaishouAnchorDetailDrawer.KuaishouAnchorRow 子集兼容） */
export interface KuaishouRow {
  id: string;
  account_name: string;
  platform_account_id: string | null;
  avatar: string | null;
  product: string;
  agent_dingtalk_user_id: string | null;
  agent_name: string | null;
  fans_count: number | null;
  joined_at: string | null;
  contract_expire_at: string | null;
  renewal_status: string | null;
  broker_name_raw: string | null;
  live_status: string;
  // 直播表现
  session_count: number;
  total_amt: number;
  avg_acu: number;
  max_peak: number;
  total_add_fans: number;
  total_duration_h: number;
  // 流量
  total_play_uv: number;
  total_play_user_cnt: number;
  avg_play_rate: number;
  avg_per_play_time_min: number;
  // 涨粉
  total_follow_author: number;
  total_cancel_follow: number;
  avg_transfer_fans_rate: number;
  // 互动
  total_like_cnt: number;
  total_comment_cnt: number;
  total_share_cnt: number;
  avg_like_rate: number;
  avg_comment_rate: number;
  // 送礼
  total_send_gift_uv: number;
  total_sent_gift_cnt: number;
  total_live_video_amt: number;
  total_live_chat_room_amt: number;
  // 违规
  total_report_num: number;
  avg_report_rate: number;
  // 流量补
  avg_live_cover_ctr: number;
  // 涨粉补
  max_fans_club_cnt: number;
  // 互动补
  total_like_uv: number;
  total_comment_uv: number;
  avg_share_rate: number;
  total_share_uv: number;
  total_interact_num: number;
  avg_interact_rate: number;
  // 画像/分级/状态（today_extra 最新一场）
  fans_most_age: string | null;
  fans_male_rate: number | null;
  fans_most_province: string | null;
  author_type: string | null;
  author_ratio: number | null;
  has_promote: boolean | null;
  has_punish: boolean | null;
  settle_in_time: number | null;
  settle_province: string | null;
}

interface KuaishouServerKpi {
  total: number;
  withAgent: number;
  contractExpiringIn90Days: number;
  renewalPending: number;
  totalSessions: number;
  totalAmt: number;
  totalAddFans: number;
  prevTotalSessions: number;
  prevTotalAmt: number;
  prevTotalAddFans: number;
}

const PRODUCT_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "捕鱼大作战", label: "捕鱼大作战" },
  { value: "途游休闲捕鱼", label: "途游休闲捕鱼" },
  { value: "电玩捕鱼", label: "电玩捕鱼" },
  { value: "未分类", label: "未分类" },
] as const;

const DAYS_PRESETS = [
  { days: 1, label: "昨日" },
  { days: 7, label: "近 7 日" },
  { days: 30, label: "近 30 日" },
] as const;

function todayCST(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}
function daysAgoCST(n: number): string {
  return new Date(Date.now() - (n - 1) * 86400_000 + 8 * 3600_000).toISOString().slice(0, 10);
}
function presetRange(days: number): { from: string; to: string } {
  if (days === 1) {
    const y = daysAgoCST(2);
    return { from: y, to: y };
  }
  return { from: daysAgoCST(days), to: todayCST() };
}

function fmtChinese(n: number): string {
  if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2).replace(/\.?0+$/, "") + "亿";
  if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(2).replace(/\.?0+$/, "") + "万";
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}
function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1e4) return "¥" + (n / 1e4).toFixed(2).replace(/\.?0+$/, "") + "万";
  return "¥" + n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function DeltaPill({ cur, prev }: { cur: number; prev: number }): ReactNode {
  if (prev === 0 && cur === 0) return null;
  if (prev === 0) {
    return <span className="text-muted-foreground/70">较前期 —</span>;
  }
  const delta = ((cur - prev) / prev) * 100;
  if (Math.abs(delta) < 0.5) {
    return <span className="text-muted-foreground/70">— 持平</span>;
  }
  const up = delta > 0;
  return (
    <span className={cn(up ? "text-[var(--change-up)]" : "text-[var(--change-down)]")}>
      {up ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

const transparentInput =
  "h-8 rounded border border-transparent bg-transparent px-2 text-sm placeholder:text-slate-400 hover:border-slate-200 focus:border-primary focus:bg-white focus:outline-none";

function KuaishouFilters({
  filters,
  onChange,
}: {
  filters: AnchorFilters;
  onChange: (f: AnchorFilters) => void;
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        type="date"
        value={filters.date_from}
        max={filters.date_to}
        onChange={(e) => onChange({ ...filters, date_from: e.target.value })}
        className={`${transparentInput} w-[140px] shrink-0`}
      />
      <span className="text-muted-foreground shrink-0">~</span>
      <input
        type="date"
        value={filters.date_to}
        min={filters.date_from}
        max={todayCST()}
        onChange={(e) => onChange({ ...filters, date_to: e.target.value })}
        className={`${transparentInput} w-[140px] shrink-0`}
      />
      <div className="flex shrink-0 gap-1">
        {DAYS_PRESETS.map((p) => {
          const r = presetRange(p.days);
          const active = filters.date_from === r.from && filters.date_to === r.to;
          return (
            <Button
              key={p.days}
              size="sm"
              variant={active ? "default" : "ghost"}
              onClick={() => onChange({ ...filters, date_from: r.from, date_to: r.to })}
            >
              {p.label}
            </Button>
          );
        })}
      </div>
      <input
        placeholder="搜索昵称 / 快手 ID"
        value={filters.search ?? ""}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        className={`${transparentInput} ml-auto min-w-0 flex-1 max-w-[220px]`}
      />
    </div>
  );
}

const SYSTEM_PRESETS: SystemPreset<KuaishouColKey>[] = PRODUCT_OPTIONS.map((o) => ({
  id: o.value,
  label: o.label,
  // 不带 keys → 切 chip 不联动 visibleKeys
  appliesFilter: { product: o.value },
}));

const PINNED_KS = KS_COLUMNS.filter((c) => c.pinned);
const DEFAULT_RANGE = presetRange(7);

function renderKuaishouCell(col: ColumnDef<KuaishouColKey>, r: KuaishouRow): ReactNode | undefined {
  const muted = (txt: ReactNode = "—"): ReactNode => (
    <span className="text-muted-foreground">{txt}</span>
  );
  const numCell = (v: number, fmt: (n: number) => ReactNode = fmtChinese): ReactNode =>
    v > 0 ? fmt(v) : muted();
  const pctNullable = (v: number | null, digits = 2): ReactNode =>
    v != null ? `${(v * 100).toFixed(digits)}%` : muted();
  const textNullable = (v: string | null): ReactNode => v ?? muted();
  const boolDisplay = (v: boolean | null): ReactNode =>
    v === true ? "是" : v === false ? "否" : muted();
  switch (col.key) {
    case "agent_name":
      return r.agent_name ?? muted(r.broker_name_raw ?? "未分配");
    case "live_status":
      return r.live_status === "living" ? (
        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">直播中</span>
      ) : (
        <span className="text-muted-foreground text-xs">未开播</span>
      );
    case "fans_count":
      return r.fans_count != null ? r.fans_count.toLocaleString() : muted();
    case "joined_at":
      return r.joined_at ?? muted();
    case "contract_expire_at":
      return <ContractExpireBadge date={r.contract_expire_at} />;
    case "session_count":
      return r.session_count > 0 ? r.session_count : muted();
    case "total_amt":
      return r.total_amt > 0 ? (
        <span className="font-medium">{fmtMoney(r.total_amt)}</span>
      ) : (
        muted()
      );
    case "avg_acu":
      return r.avg_acu > 0 ? Math.round(r.avg_acu) : muted();
    case "max_peak":
      return r.max_peak > 0 ? fmtChinese(r.max_peak) : muted();
    case "total_add_fans":
      return r.total_add_fans > 0 ? fmtChinese(r.total_add_fans) : muted();
    case "total_duration_h":
      return r.total_duration_h > 0 ? `${r.total_duration_h.toFixed(1)}h` : muted();
    case "total_play_uv":
      return r.total_play_uv > 0 ? fmtChinese(r.total_play_uv) : muted();
    case "total_play_user_cnt":
      return r.total_play_user_cnt > 0 ? fmtChinese(r.total_play_user_cnt) : muted();
    case "avg_play_rate":
      return r.avg_play_rate > 0 ? `${(r.avg_play_rate * 100).toFixed(1)}%` : muted();
    case "avg_per_play_time_min":
      return r.avg_per_play_time_min > 0 ? `${r.avg_per_play_time_min.toFixed(1)}分` : muted();
    case "total_follow_author":
      return r.total_follow_author > 0 ? fmtChinese(r.total_follow_author) : muted();
    case "total_cancel_follow":
      return r.total_cancel_follow > 0 ? fmtChinese(r.total_cancel_follow) : muted();
    case "avg_transfer_fans_rate":
      return r.avg_transfer_fans_rate > 0
        ? `${(r.avg_transfer_fans_rate * 100).toFixed(2)}%`
        : muted();
    case "total_like_cnt":
      return r.total_like_cnt > 0 ? fmtChinese(r.total_like_cnt) : muted();
    case "avg_like_rate":
      return r.avg_like_rate > 0 ? `${(r.avg_like_rate * 100).toFixed(0)}%` : muted();
    case "total_comment_cnt":
      return r.total_comment_cnt > 0 ? fmtChinese(r.total_comment_cnt) : muted();
    case "avg_comment_rate":
      return r.avg_comment_rate > 0 ? `${(r.avg_comment_rate * 100).toFixed(2)}%` : muted();
    case "total_share_cnt":
      return r.total_share_cnt > 0 ? fmtChinese(r.total_share_cnt) : muted();
    case "total_send_gift_uv":
      return r.total_send_gift_uv > 0 ? fmtChinese(r.total_send_gift_uv) : muted();
    case "total_sent_gift_cnt":
      return r.total_sent_gift_cnt > 0 ? fmtChinese(r.total_sent_gift_cnt) : muted();
    case "total_report_num":
      return r.total_report_num > 0 ? r.total_report_num : muted();
    case "avg_report_rate":
      return numCell(r.avg_report_rate, (n) => `${(n * 100).toFixed(2)}%`);
    case "avg_live_cover_ctr":
      return numCell(r.avg_live_cover_ctr, (n) => `${(n * 100).toFixed(2)}%`);
    case "max_fans_club_cnt":
      return numCell(r.max_fans_club_cnt);
    case "avg_share_rate":
      return numCell(r.avg_share_rate, (n) => `${(n * 100).toFixed(2)}%`);
    case "total_live_video_amt":
      return numCell(r.total_live_video_amt, fmtMoney);
    case "total_live_chat_room_amt":
      return numCell(r.total_live_chat_room_amt, fmtMoney);
    // 画像/分级/状态
    case "fans_most_age":
      return textNullable(r.fans_most_age);
    case "fans_male_rate":
      return pctNullable(r.fans_male_rate, 1);
    case "fans_most_province":
      return textNullable(r.fans_most_province);
    case "author_type":
      return textNullable(r.author_type);
    case "author_ratio":
      return pctNullable(r.author_ratio);
    case "has_promote":
      return boolDisplay(r.has_promote);
    case "has_punish":
      return boolDisplay(r.has_punish);
    case "settle_in_time":
      if (!r.settle_in_time) return muted();
      return new Date(
        r.settle_in_time > 1e10 ? r.settle_in_time : r.settle_in_time * 1000,
      ).toLocaleDateString("zh-CN");
    case "settle_province":
      return textNullable(r.settle_province);
    case "product":
      return r.product;
    default:
      return undefined;
  }
}

function ContractExpireBadge({ date }: { date: string | null }): React.JSX.Element {
  if (!date) return <span className="text-muted-foreground">—</span>;
  const exp = new Date(date);
  const days = Math.floor((exp.getTime() - Date.now()) / 86400_000);
  if (days < 0) return <span className="text-rose-500">已过期 {date}</span>;
  if (days <= 90)
    return (
      <span className="text-amber-600">
        {date} <span className="text-xs">({days}天)</span>
      </span>
    );
  return <span className="text-foreground">{date}</span>;
}

export const kuaishouConfig: PlatformConfig<KuaishouColKey, KuaishouRow> = {
  id: "kuaishou",
  label: "快手",
  rowKey: "id",
  apiEndpoint: "/api/anchors-kuaishou",

  allColumns: KS_COLUMNS,
  pinnedColumns: PINNED_KS,
  customizerGroups: [...KS_GROUPS],
  getColumnsByGroup: getKsColumnsByGroup,
  getColumnsBySubGroup: getKsColumnsBySubGroup,

  defaultVisibleKeys: KS_DEFAULT_VISIBLE,
  defaultSort: { key: "total_amt", dir: "desc" },
  defaultPageSize: 15,
  storageKeyPrefix: "qjhy:anchors:kuaishou:cols:",
  colsByPreset: false,

  systemPresets: SYSTEM_PRESETS,
  defaultSystemPresetId: "all",
  systemPresetLabel: "项目:",

  userPresetsEnabled: false,

  kpiMode: "server",
  buildKpiItems(raw): KpiItemSpec[] {
    const k = raw as unknown as KuaishouServerKpi;
    return [
      { key: "total", label: "账号总数", value: k.total.toLocaleString() },
      { key: "withAgent", label: "已分配经纪人", value: k.withAgent.toLocaleString() },
      {
        key: "totalSessions",
        label: "本期场次",
        value: k.totalSessions.toLocaleString(),
        footer: <DeltaPill cur={k.totalSessions} prev={k.prevTotalSessions} />,
      },
      {
        key: "totalAmt",
        label: "本期流水",
        value: fmtMoney(k.totalAmt),
        footer: <DeltaPill cur={k.totalAmt} prev={k.prevTotalAmt} />,
      },
      {
        key: "totalAddFans",
        label: "本期涨粉",
        value: fmtChinese(k.totalAddFans),
        footer: <DeltaPill cur={k.totalAddFans} prev={k.prevTotalAddFans} />,
      },
      {
        key: "expiring",
        label: "合约 90 天内到期",
        value: k.contractExpiringIn90Days.toLocaleString(),
      },
    ];
  },

  compareMode: "row+kpi",
  dataSourceEnabled: true,
  dataSourceColumnPresets: {
    all: KS_DEFAULT_VISIBLE,
    today: [
      "agent_name",
      "live_status",
      "session_count",
      "total_amt",
      "avg_acu",
      "max_peak",
      "total_like_cnt",
      "total_send_gift_uv",
      "total_sent_gift_cnt",
      "fans_most_age",
      "fans_male_rate",
      "fans_most_province",
      "author_type",
      "has_punish",
    ],
    history: [
      "agent_name",
      "fans_count",
      "contract_expire_at",
      "session_count",
      "total_amt",
      "avg_acu",
      "max_peak",
      "total_duration_h",
      "total_play_uv",
      "avg_play_rate",
      "avg_per_play_time_min",
      "total_add_fans",
      "avg_transfer_fans_rate",
      "total_like_cnt",
      "avg_like_rate",
      "total_send_gift_uv",
      "total_sent_gift_cnt",
    ],
  },

  defaultFilters: {
    date_from: DEFAULT_RANGE.from,
    date_to: DEFAULT_RANGE.to,
    product: "all",
    data_source: "all",
    search: "",
  },
  FiltersComponent: KuaishouFilters,

  buildApiParams(filters) {
    const sp = new URLSearchParams();
    sp.set("date_from", filters.date_from);
    sp.set("date_to", filters.date_to);
    sp.set("product", filters.product ?? "all");
    sp.set("data_source", filters.data_source ?? "all");
    if (filters.search) sp.set("search", filters.search);
    return sp;
  },
  parseApiResponse(json) {
    const d = (json ?? {}) as {
      rows?: KuaishouRow[];
      previousRows?: KuaishouRow[];
      kpi?: KuaishouServerKpi;
    };
    return {
      rows: d.rows ?? [],
      previousRows: d.previousRows ?? [],
      serverKpi: d.kpi as unknown as Record<string, number>,
    };
  },

  getSortValue(r, key) {
    if (key === "live_status") return r.live_status === "living" ? 1 : 0;
    if (key === "agent_name") return r.agent_name ?? r.broker_name_raw ?? null;
    const v = (r as unknown as Record<string, unknown>)[key];
    if (typeof v === "number") return v;
    return (v as string | null) ?? null;
  },

  renderAnchorInfo(r) {
    return (
      <div className="flex items-center gap-2">
        {r.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={r.avatar}
            alt={r.account_name}
            className="h-8 w-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="h-8 w-8 shrink-0 rounded-full bg-slate-200" />
        )}
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{r.account_name}</span>
          <span className="text-muted-foreground truncate text-xs">
            快手ID: {r.platform_account_id ?? "--"}
          </span>
        </div>
      </div>
    );
  },

  renderCell: renderKuaishouCell,
  rowClickOpensDrawer: true,

  DrawerComponent({ row, visibleColumns, kpiColumns, onOpenChange }) {
    return (
      <KuaishouAnchorDetailDrawer
        anchor={row}
        visibleColumns={visibleColumns}
        kpiColumns={kpiColumns}
        onOpenChange={onOpenChange}
      />
    );
  },

  exportCsv(rows, visibleColumns) {
    const get = (r: KuaishouRow, k: KuaishouColKey): string => {
      const v = (r as unknown as Record<string, unknown>)[k];
      if (v == null) return "";
      return String(v);
    };
    const header = visibleColumns.map((c) => c.label).join(",");
    const lines = rows.map((r) =>
      visibleColumns.map((c) => `"${get(r, c.key).replace(/"/g, '""')}"`).join(","),
    );
    const csv = "﻿" + header + "\n" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kuaishou-anchors-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
