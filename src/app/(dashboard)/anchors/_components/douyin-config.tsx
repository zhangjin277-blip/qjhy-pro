import { Music2 } from "lucide-react";
import { Filters } from "./filters";
import { AnchorDetailDrawer } from "./anchor-detail-drawer";
import {
  ALL_COLUMNS,
  ALL_GROUPS,
  PINNED_COLUMNS,
  PRESETS,
  getColumnsByGroup,
  getColumnsBySubGroup,
  type ColumnDef,
} from "./column-presets";
import type { AnchorListRow } from "@/modules/anchors";
import type { AnchorFilters, PlatformConfig, SystemPreset } from "./platform-config";

export type DouyinColKey = (typeof ALL_COLUMNS)[number]["key"];

const yesterday = (): string => new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

const SYSTEM_PRESETS: SystemPreset<DouyinColKey>[] = PRESETS.filter((p) => p.id !== "custom").map(
  (p) => {
    const project: AnchorFilters["project"] =
      p.id === "ddz" ? "ddz" : p.id === "three" ? "three" : "all";
    return {
      id: p.id,
      label: p.label,
      keys: p.keys as DouyinColKey[],
      appliesFilter: { project },
    };
  },
);

function defaultKpiKeysFor(preset: string): DouyinColKey[] {
  if (preset === "three") {
    return [
      "total_fan_ticket",
      "minigame_total_amount",
      "show_uv",
      "mg_watch_ucnt",
      "mg_active_ucnt",
      "mg_duration",
    ];
  }
  return [
    "total_fan_ticket",
    "controller_total_amount",
    "g_total_amount",
    "v_total_amount",
    "show_uv",
    "g_watch_ucnt",
  ];
}

export const douyinConfig: PlatformConfig<DouyinColKey, AnchorListRow> = {
  id: "douyin",
  label: "抖音",
  rowKey: "anchor_id",
  apiEndpoint: "/api/anchors",
  compareEndpoint: "/api/anchors/compare",

  allColumns: ALL_COLUMNS as ColumnDef<DouyinColKey>[],
  pinnedColumns: PINNED_COLUMNS as ColumnDef<DouyinColKey>[],
  customizerGroups: [...ALL_GROUPS],
  getColumnsByGroup: getColumnsByGroup as (g: string) => ColumnDef<DouyinColKey>[],
  getColumnsBySubGroup: getColumnsBySubGroup as (
    g: string,
  ) => { subGroup: string | null; columns: ColumnDef<DouyinColKey>[] }[],

  defaultVisibleKeys: (PRESETS.find((p) => p.id === "ddz")?.keys ?? []) as DouyinColKey[],
  defaultSort: { key: "total_fan_ticket", dir: "desc" },
  storageKeyPrefix: "anchor_columns_v5_", // 与现存 saveColumns 兼容
  colsByPreset: true,

  systemPresets: SYSTEM_PRESETS,
  defaultSystemPresetId: "ddz",
  systemPresetLabel: "预设:",

  userPresetsEnabled: true,

  kpiMode: "client",
  defaultKpiKeysFor,
  kpiPickerEnabled: true,

  compareMode: "row+kpi",
  dataSourceEnabled: false,

  defaultFilters: {
    date_from: yesterday(),
    date_to: yesterday(),
    project: "all",
  },
  brokerFilter: {
    operateLabel: "运营经纪人",
    recruitLabel: "招募经纪人",
    getOperate: (r) => r.broker_name ?? null,
    getRecruit: (r) => r.recruit_broker_name ?? null,
  },
  FiltersComponent: Filters,

  buildApiParams(filters) {
    const sp = new URLSearchParams();
    sp.set("date_from", filters.date_from);
    sp.set("date_to", filters.date_to);
    if (filters.project) sp.set("project", filters.project);
    if (filters.search) sp.set("search", filters.search);
    return sp;
  },
  parseApiResponse(json) {
    const d = (json ?? {}) as {
      rows?: AnchorListRow[];
      previousRows?: AnchorListRow[];
      days?: number;
    };
    return {
      rows: d.rows ?? [],
      previousRows: d.previousRows ?? [],
      days: d.days ?? 1,
    };
  },

  renderAnchorInfo(r, onSelect) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSelect}
          className="shrink-0 rounded-full ring-offset-2 ring-offset-card cursor-pointer hover:ring-2 hover:ring-primary/40 transition-shadow"
          title="查看日明细"
          aria-label={`查看 ${r.nick_name} 的日明细`}
        >
          {r.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={r.avatar}
              alt={r.nick_name}
              className="size-10 rounded-full bg-muted object-cover block"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="size-10 rounded-full bg-muted" />
          )}
        </button>
        <div className="flex flex-col min-w-0 flex-1 leading-tight">
          <span className="text-sm font-medium truncate" title={r.nick_name}>
            {r.nick_name || "—"}
          </span>
          {r.aweme_display_id && (
            <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 min-w-0">
              <Music2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{r.aweme_display_id}</span>
            </span>
          )}
          <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 min-w-0">
            <span className="text-[10px] shrink-0">UID</span>
            <span className="truncate">{r.anchor_id}</span>
          </span>
        </div>
      </div>
    );
  },

  rowClickOpensDrawer: false,

  getSortValue(r, key) {
    if (key === "project") return r.is_threekingdoms ? "三国" : "斗地主";
    const v = r[key as keyof AnchorListRow];
    if (typeof v === "boolean") return v ? 1 : 0;
    return (v as string | number | null) ?? null;
  },

  DrawerComponent({ row, filters, visibleColumns, kpiColumns, onOpenChange }) {
    return (
      <AnchorDetailDrawer
        anchor={row}
        dateFrom={filters.date_from}
        dateTo={filters.date_to}
        kpiColumns={kpiColumns}
        visibleColumns={visibleColumns}
        onOpenChange={onOpenChange}
      />
    );
  },

  resolvePresetForRow(r) {
    return r.is_threekingdoms ? "three" : "ddz";
  },

  exportCsv(rows, visibleColumns) {
    const headers: string[] = [];
    for (const c of visibleColumns) {
      if (c.fmt === "anchor_info") {
        headers.push("主播昵称", "抖音号", "UID");
      } else {
        headers.push(c.label);
      }
    }
    const lines = [headers.join(",")];
    for (const r of rows) {
      const cells: string[] = [];
      for (const c of visibleColumns) {
        if (c.fmt === "anchor_info") {
          cells.push(
            `"${String(r.nick_name ?? "").replace(/"/g, '""')}"`,
            `"${String(r.aweme_short_id ?? r.aweme_display_id ?? "").replace(/"/g, '""')}"`,
            `"${String(r.anchor_id ?? "").replace(/"/g, '""')}"`,
          );
          continue;
        }
        let v: unknown;
        if (c.key === "project") {
          v = r.is_threekingdoms ? "三国" : "斗地主";
        } else {
          v = r[c.key as keyof AnchorListRow];
          if (typeof v === "boolean") v = v ? 1 : 0;
        }
        cells.push(`"${String(v ?? "").replace(/"/g, '""')}"`);
      }
      lines.push(cells.join(","));
    }
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `anchors-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
