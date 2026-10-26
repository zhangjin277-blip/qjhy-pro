"use client";

import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  MODULE_KEYS,
  MODULE_LABEL,
  MODULE_POINTS,
  TOTAL_POINT_COUNT,
  type ModuleKey,
  type Scope,
} from "@/modules/permissions";

/** 单板块配置（enabled=false 表示该板块不写行/无覆盖，由调用方赋语义） */
export interface ModulePointConfig {
  enabled: boolean;
  scope: Scope;
  points: string[];
}

export type PointMatrixValue = Record<ModuleKey, ModulePointConfig>;

export function emptyPointMatrix(enabled = false): PointMatrixValue {
  return MODULE_KEYS.reduce((acc, m) => {
    acc[m] = { enabled, scope: "none", points: [] };
    return acc;
  }, {} as PointMatrixValue);
}

interface Props {
  value: PointMatrixValue;
  onChange: (next: PointMatrixValue) => void;
  /** 板块行头部左侧的启用勾选是否展示（岗位编辑=true；个人覆盖场景另有语义） */
  showEnableToggle?: boolean;
  /** enabled=false 时整块置灰的提示文案 */
  disabledHint?: string;
  expandedLayout?: boolean;
}

/**
 * 权限点配置矩阵（spec 2026-07-06 §5，参考快手公会后台交互）：
 * 板块折叠分组 + 数据范围下拉 + 功能区行 × 权限点勾选 + 敏感红标 +
 * 关键词搜索 + 「开通 x/n」计数。
 */
export function PointMatrix({ value, onChange, showEnableToggle = true, disabledHint, expandedLayout = false }: Props) {
  const [keyword, setKeyword] = useState("");
  const [collapsed, setCollapsed] = useState<Set<ModuleKey>>(new Set());

  const kw = keyword.trim().toLowerCase();

  const totalGranted = useMemo(
    () =>
      MODULE_KEYS.reduce((s, m) => s + (value[m]?.enabled ? (value[m]?.points.length ?? 0) : 0), 0),
    [value],
  );

  function setModule(m: ModuleKey, patch: Partial<ModulePointConfig>) {
    onChange({ ...value, [m]: { ...value[m], ...patch } });
  }

  function togglePoint(m: ModuleKey, key: string, checked: boolean) {
    const cur = new Set(value[m].points);
    if (checked) cur.add(key);
    else cur.delete(key);
    setModule(m, { points: [...cur] });
  }

  function toggleCollapse(m: ModuleKey) {
    setCollapsed((prev) => {
      const n = new Set(prev);
      if (n.has(m)) n.delete(m);
      else n.add(m);
      return n;
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          共计开通 <b className="text-foreground">{totalGranted}</b>/{TOTAL_POINT_COUNT} 个权限点
        </span>
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="权限关键词"
          className="h-8 w-44 text-xs"
        />
      </div>

      <div className={expandedLayout ? "space-y-4" : "max-h-[52vh] space-y-2 overflow-y-auto pr-1"}>
        {MODULE_KEYS.map((m) => {
          const cfg = value[m];
          const defs = MODULE_POINTS[m];
          // 搜索：过滤命中该板块的点；无命中且有关键词 → 隐藏板块
          const matched = kw
            ? defs.filter((d) => d.label.toLowerCase().includes(kw) || d.key.includes(kw))
            : defs;
          const moduleNameHit = kw && MODULE_LABEL[m].toLowerCase().includes(kw);
          if (kw && matched.length === 0 && !moduleNameHit) return null;
          const shownDefs = moduleNameHit && matched.length === 0 ? defs : matched;

          const grantedInModule = defs.filter((d) => cfg.points.includes(d.key)).length;
          const isCollapsed = !kw && collapsed.has(m);

          // section 分组
          const sections = new Map<string, typeof defs>();
          for (const d of shownDefs) {
            const arr = sections.get(d.section) ?? [];
            arr.push(d);
            sections.set(d.section, arr);
          }

          return (
            <div key={m} id={expandedLayout ? `role-permission-${m}` : undefined} className="scroll-mt-4 rounded-lg border">
              <div className="flex items-center gap-2 bg-muted/30 px-3 py-2">
                <button
                  type="button"
                  onClick={() => toggleCollapse(m)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                  aria-label={isCollapsed ? "展开" : "折叠"}
                >
                  {isCollapsed ? "▸" : "▾"}
                </button>
                {showEnableToggle && (
                  <input
                    type="checkbox"
                    checked={cfg.enabled}
                    onChange={(e) => setModule(m, { enabled: e.target.checked })}
                    className="h-4 w-4"
                  />
                )}
                <span className="text-sm font-medium">{MODULE_LABEL[m]}</span>
                <div className="ml-2">
                  <Select
                    value={cfg.scope}
                    onValueChange={(v) => setModule(m, { scope: (v ?? "none") as Scope })}
                    disabled={!cfg.enabled}
                  >
                    <SelectTrigger className="h-7 w-24 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">无权限</SelectItem>
                      <SelectItem value="self">仅本人</SelectItem>
                      <SelectItem value="team">本部门</SelectItem>
                      <SelectItem value="all">全部</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {defs.length === 0 ? "无权限点" : `开通 ${grantedInModule}/${defs.length}`}
                </span>
              </div>

              {!isCollapsed && defs.length > 0 && (
                <div className={`divide-y ${cfg.enabled ? "" : "pointer-events-none opacity-40"}`}>
                  {[...sections.entries()].map(([section, pts]) => (
                    <div key={section} className="flex gap-3 px-3 py-2">
                      <div className="w-24 shrink-0 pt-0.5 text-xs text-muted-foreground">
                        {section}
                      </div>
                      <div className="flex flex-1 flex-wrap gap-x-5 gap-y-1.5">
                        {pts.map((d) => (
                          <label
                            key={d.key}
                            className="flex cursor-pointer items-center gap-1.5 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={cfg.points.includes(d.key)}
                              onChange={(e) => togglePoint(m, d.key, e.target.checked)}
                              className="h-4 w-4"
                            />
                            <span className={kw && matched.includes(d) ? "text-primary" : ""}>
                              {d.label}
                            </span>
                            {d.sensitive && (
                              <span className="rounded bg-red-50 px-1 text-[10px] font-semibold text-red-600">
                                敏
                              </span>
                            )}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {disabledHint && <p className="text-xs text-muted-foreground">{disabledHint}</p>}
    </div>
  );
}
