"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { EditorOption } from "@/modules/editing-editor";
import type { ProductOption } from "@/modules/product-config";

export interface FilterBarProps {
  products: ProductOption[];
  editors: EditorOption[];
  onNewTask: () => void;
}

export function FilterBar({ products, editors, onNewTask }: FilterBarProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const [productOpen, setProductOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  const selectedProducts = sp.get("products")?.split(",").filter(Boolean) ?? [];
  const selectedEditors = sp.get("editors")?.split(",").filter(Boolean) ?? [];

  function updateParam(key: string, values: string[]) {
    const params = new URLSearchParams(sp.toString());
    if (values.length === 0) params.delete(key);
    else params.set(key, values.join(","));
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 backdrop-blur">
      {/* 视图切换 */}
      <div className="inline-flex rounded-md bg-slate-100 p-0.5">
        <button className="rounded bg-white px-3.5 py-1.5 text-sm font-medium text-blue-600 shadow-sm">
          看板
        </button>
        <button
          onClick={() => router.push("/editing/table")}
          className="rounded px-3.5 py-1.5 text-sm text-slate-500 hover:text-slate-700"
        >
          表格
        </button>
      </div>

      <div className="h-5 w-px bg-border" />

      {/* 产品筛选 */}
      <div className="relative">
        <button
          onClick={() => {
            setProductOpen(!productOpen);
            setEditorOpen(false);
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
          <div className="absolute left-0 top-full z-10 mt-1 min-w-[180px] rounded-md border border-border bg-white p-2 shadow-lg">
            {products.length === 0 ? (
              <div className="px-2 py-2 text-sm text-muted-foreground">暂无产品</div>
            ) : (
              products.map((p) => {
                const checked = selectedProducts.includes(p.productName);
                return (
                  <label
                    key={p.productName}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-slate-50"
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
              })
            )}
          </div>
        )}
      </div>

      {/* 主播筛选（MVP 简化为占位） */}
      <button
        disabled
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-1.5 text-sm text-muted-foreground opacity-50"
      >
        <span>主播</span>
        <span>全部</span>
        <span className="text-[9px]">▼</span>
      </button>

      {/* 剪辑师筛选 */}
      <div className="relative">
        <button
          onClick={() => {
            setEditorOpen(!editorOpen);
            setProductOpen(false);
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

      {/* 日期范围（占位，T22 时再做） */}
      <button className="inline-flex items-center gap-1.5 rounded-md border border-blue-500 bg-blue-50 px-3 py-1.5 text-sm text-blue-600">
        <span>日期</span>
        <span>近 7 天</span>
        <span className="text-[9px]">▼</span>
      </button>

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
