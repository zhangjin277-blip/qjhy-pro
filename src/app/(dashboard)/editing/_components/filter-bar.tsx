"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { EditorOption } from "@/modules/editing-editor";
import type { ProductOption } from "@/modules/product-config";

export interface FilterBarProps {
  products: ProductOption[];
  editors: EditorOption[];
  anchors: { id: string; name: string; businessLine: string }[];
  onNewTask: () => void;
}

export function FilterBar({ products, editors, anchors, onNewTask }: FilterBarProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const [productOpen, setProductOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [anchorOpen, setAnchorOpen] = useState(false);
  const [anchorQuery, setAnchorQuery] = useState("");
  const [productHoverGroup, setProductHoverGroup] = useState<string | null>(null);
  const [anchorHoverGroup, setAnchorHoverGroup] = useState<string | null>(null);

  // 按 category 分组产品
  const productGroups = (() => {
    const map = new Map<string, ProductOption[]>();
    for (const p of products) {
      const k = p.category || "其他";
      const arr = map.get(k);
      if (arr) arr.push(p);
      else map.set(k, [p]);
    }
    return Array.from(map.entries()).map(([category, items]) => ({ category, items }));
  })();

  // 按 business_line 分组主播
  const anchorGroups = (() => {
    const filtered = anchorQuery
      ? anchors.filter((a) => a.name.toLowerCase().includes(anchorQuery.toLowerCase()))
      : anchors;
    const map = new Map<string, typeof anchors>();
    for (const a of filtered) {
      const k = a.businessLine || "其他";
      const arr = map.get(k);
      if (arr) arr.push(a);
      else map.set(k, [a]);
    }
    return Array.from(map.entries()).map(([businessLine, items]) => ({ businessLine, items }));
  })();

  const selectedProducts = sp.get("products")?.split(",").filter(Boolean) ?? [];
  const selectedEditors = sp.get("editors")?.split(",").filter(Boolean) ?? [];
  const selectedAnchors = sp.get("anchors")?.split(",").filter(Boolean) ?? [];
  const range = (sp.get("range") ?? "7d") as "all" | "today" | "7d" | "30d" | "custom";
  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  const daysAgo = (n: number): string =>
    new Date(Date.now() - n * 86400_000).toLocaleDateString("sv-SE", {
      timeZone: "Asia/Shanghai",
    });

  // 日期输入框显示当前生效区间（快捷档位换算成具体日期；全部时留空）
  const displayFrom =
    range === "custom"
      ? (sp.get("from") ?? todayStr)
      : range === "today"
        ? todayStr
        : range === "7d"
          ? daysAgo(7)
          : range === "30d"
            ? daysAgo(30)
            : "";
  const displayTo =
    range === "custom" ? (sp.get("to") ?? todayStr) : range === "all" ? "" : todayStr;

  const activeCategory = productHoverGroup ?? productGroups[0]?.category;
  const activeCatItems = productGroups.find((g) => g.category === activeCategory)?.items ?? [];

  function updateParam(key: string, values: string[]) {
    const params = new URLSearchParams(sp.toString());
    if (values.length === 0) params.delete(key);
    else params.set(key, values.join(","));
    router.push(`?${params.toString()}`);
  }

  function setRange(next: "all" | "today" | "7d" | "30d") {
    const params = new URLSearchParams(sp.toString());
    if (next === "7d") params.delete("range");
    else params.set("range", next);
    params.delete("from");
    params.delete("to");
    router.push(`?${params.toString()}`);
  }

  function setCustomRange(from: string, to: string) {
    if (!from || !to) return;
    const params = new URLSearchParams(sp.toString());
    params.set("range", "custom");
    params.set("from", from);
    params.set("to", to);
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 backdrop-blur">
      {/* 产品筛选 */}
      <div className="relative">
        <button
          onClick={() => {
            setProductOpen(!productOpen);
            setEditorOpen(false);
            setAnchorOpen(false);
          }}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition ${
            selectedProducts.length > 0
              ? "border-blue-500 bg-blue-50 text-blue-600"
              : "border-border bg-white hover:border-blue-500 hover:text-blue-600"
          }`}
        >
          <span className="text-muted-foreground">产品</span>
          <span>{selectedProducts.length > 0 ? `已选 ${selectedProducts.length}` : "全部"}</span>
          <span className="text-[9px] text-muted-foreground">▼</span>
        </button>
        {productOpen && (
          <div className="absolute left-0 top-full z-10 mt-1 flex rounded-md border border-border bg-white shadow-lg">
            {products.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">暂无产品</div>
            ) : (
              <>
                {/* 左栏：category */}
                <div className="w-[110px] border-r border-border py-1">
                  {productGroups.map((g) => {
                    const active = activeCategory === g.category;
                    return (
                      <div
                        key={g.category}
                        onMouseEnter={() => setProductHoverGroup(g.category)}
                        className={`cursor-pointer px-3 py-1.5 text-sm ${
                          active ? "bg-slate-50 text-blue-600" : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {g.category}
                      </div>
                    );
                  })}
                </div>
                {/* 右栏：products */}
                <div className="min-w-[160px] py-1">
                  {activeCatItems.map((p) => {
                    const checked = selectedProducts.includes(p.productName);
                    return (
                      <label
                        key={p.productName}
                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked
                              ? selectedProducts.filter((x) => x !== p.productName)
                              : [...selectedProducts, p.productName];
                            updateParam("products", next);
                          }}
                        />
                        <span className="text-sm">{p.productName}</span>
                      </label>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 主播筛选 */}
      <div className="relative">
        <button
          onClick={() => {
            setAnchorOpen(!anchorOpen);
            setProductOpen(false);
            setEditorOpen(false);
          }}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition ${
            selectedAnchors.length > 0
              ? "border-blue-500 bg-blue-50 text-blue-600"
              : "border-border bg-white hover:border-blue-500 hover:text-blue-600"
          }`}
        >
          <span className="text-muted-foreground">主播</span>
          <span>{selectedAnchors.length > 0 ? `已选 ${selectedAnchors.length}` : "全部"}</span>
          <span className="text-[9px] text-muted-foreground">▼</span>
        </button>
        {anchorOpen && (
          <div className="absolute left-0 top-full z-10 mt-1 rounded-md border border-border bg-white shadow-lg">
            <div className="border-b border-border p-2">
              <input
                type="text"
                value={anchorQuery}
                onChange={(e) => setAnchorQuery(e.target.value)}
                placeholder="搜索主播 / 艺名"
                autoFocus
                className="w-full rounded border border-border px-2 py-1 text-xs outline-none focus:border-blue-400"
              />
            </div>
            {anchorGroups.length === 0 ? (
              <div className="px-3 py-3 text-sm text-muted-foreground">无匹配主播</div>
            ) : (
              <div className="flex">
                <div className="w-[120px] border-r border-border py-1">
                  {anchorGroups.map((g) => {
                    const active =
                      (anchorHoverGroup ?? anchorGroups[0]?.businessLine) === g.businessLine;
                    return (
                      <div
                        key={g.businessLine}
                        onMouseEnter={() => setAnchorHoverGroup(g.businessLine)}
                        className={`cursor-pointer px-3 py-1.5 text-sm ${
                          active ? "bg-slate-50 text-blue-600" : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span>{g.businessLine}</span>
                        <span className="ml-1 text-xs text-slate-400">{g.items.length}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="max-h-60 min-w-[160px] overflow-auto py-1">
                  {(
                    anchorGroups.find(
                      (g) => g.businessLine === (anchorHoverGroup ?? anchorGroups[0]?.businessLine),
                    )?.items ?? []
                  ).map((a) => {
                    const checked = selectedAnchors.includes(a.id);
                    return (
                      <label
                        key={a.id}
                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked
                              ? selectedAnchors.filter((x) => x !== a.id)
                              : [...selectedAnchors, a.id];
                            updateParam("anchors", next);
                          }}
                        />
                        <span className="text-sm">{a.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 剪辑师筛选 */}
      <div className="relative">
        <button
          onClick={() => {
            setEditorOpen(!editorOpen);
            setProductOpen(false);
            setAnchorOpen(false);
          }}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition ${
            selectedEditors.length > 0
              ? "border-blue-500 bg-blue-50 text-blue-600"
              : "border-border bg-white hover:border-blue-500 hover:text-blue-600"
          }`}
        >
          <span className="text-muted-foreground">剪辑师</span>
          <span>{selectedEditors.length > 0 ? `已选 ${selectedEditors.length}` : "全部"}</span>
          <span className="text-[9px] text-muted-foreground">▼</span>
        </button>
        {editorOpen && (
          <div className="absolute left-0 top-full z-10 mt-1 max-h-60 min-w-[180px] overflow-auto rounded-md border border-border bg-white p-2 shadow-lg">
            {editors.length === 0 ? (
              <div className="px-2 py-2 text-sm text-muted-foreground">暂无剪辑师</div>
            ) : (
              editors.map((e) => {
                const checked = selectedEditors.includes(e.userId);
                return (
                  <label
                    key={e.userId}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = checked
                          ? selectedEditors.filter((x) => x !== e.userId)
                          : [...selectedEditors, e.userId];
                        updateParam("editors", next);
                      }}
                    />
                    <span className="text-sm">{e.name}</span>
                  </label>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* 日期：自定义区间 + 快捷档位平铺 */}
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground pl-1 text-sm">日期</span>
        <input
          type="date"
          value={displayFrom}
          onChange={(e) => {
            if (e.target.value && displayTo) setCustomRange(e.target.value, displayTo);
          }}
          className="rounded-md border border-border bg-white px-2 py-1.5 text-xs text-slate-700"
        />
        <span className="text-muted-foreground text-xs">~</span>
        <input
          type="date"
          value={displayTo}
          onChange={(e) => {
            if (e.target.value && displayFrom) setCustomRange(displayFrom, e.target.value);
          }}
          className="rounded-md border border-border bg-white px-2 py-1.5 text-xs text-slate-700"
        />
        <div className="ml-1 inline-flex overflow-hidden rounded-md border border-border bg-white">
          {[
            { key: "all" as const, label: "全部" },
            { key: "today" as const, label: "今天" },
            { key: "7d" as const, label: "近 7 天" },
            { key: "30d" as const, label: "近 30 天" },
          ].map((opt, i) => (
            <button
              key={opt.key}
              onClick={() => setRange(opt.key)}
              className={`px-3 py-1.5 text-sm transition ${i > 0 ? "border-l border-border" : ""} ${
                range === opt.key
                  ? "bg-blue-500 font-medium text-white"
                  : "text-slate-600 hover:bg-blue-50 hover:text-blue-600"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1" />

      <button
        onClick={onNewTask}
        className="inline-flex items-center gap-1.5 rounded-md bg-blue-500 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-600"
      >
        <span className="text-base leading-none">+</span>
        新建任务
      </button>
    </div>
  );
}
