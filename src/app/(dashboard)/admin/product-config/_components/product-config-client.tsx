"use client";

import { useState } from "react";
import { createProduct, updateProduct, deleteProduct } from "@/modules/product-config";
import type { ProductOption } from "@/modules/product-config";
import { toast } from "sonner";

export function ProductConfigClient({ initial }: { initial: ProductOption[] }) {
  const [products, setProducts] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ displayShort: string; accentColor: string }>({
    displayShort: "",
    accentColor: "",
  });
  const [newOpen, setNewOpen] = useState(false);
  const [newDraft, setNewDraft] = useState({
    productName: "",
    displayShort: "",
    accentColor: "#1677ff",
  });

  function refresh() {
    location.reload();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => setNewOpen(true)}
          className="rounded bg-blue-500 px-3 py-1.5 text-sm text-white hover:bg-blue-600"
        >
          + 新建产品
        </button>
      </div>

      <table className="w-full overflow-hidden rounded-xl border border-border-subtle bg-white text-sm shadow-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-3 text-left">产品名（PK）</th>
            <th className="px-4 py-3 text-left">简称</th>
            <th className="px-4 py-3 text-left">主色</th>
            <th className="px-4 py-3 text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const isEditing = editing === p.productName;
            return (
              <tr key={p.productName} className="border-t border-border-subtle hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{p.productName}</td>
                <td className="px-4 py-3">
                  {isEditing ? (
                    <input
                      value={draft.displayShort}
                      onChange={(e) => setDraft({ ...draft, displayShort: e.target.value })}
                      className="rounded border px-2 py-1"
                    />
                  ) : (
                    <span>{p.displayShort}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {isEditing ? (
                    <input
                      type="text"
                      value={draft.accentColor}
                      onChange={(e) => setDraft({ ...draft, accentColor: e.target.value })}
                      className="rounded border px-2 py-1 font-mono"
                    />
                  ) : (
                    <span className="flex items-center gap-2">
                      <span
                        className="h-4 w-4 rounded"
                        style={{ backgroundColor: p.accentColor }}
                      />
                      <code className="text-xs">{p.accentColor}</code>
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {isEditing ? (
                    <span className="flex justify-end gap-2">
                      <button
                        onClick={async () => {
                          try {
                            await updateProduct({
                              productName: p.productName,
                              displayShort: draft.displayShort,
                              accentColor: draft.accentColor,
                            });
                            toast.success("已保存");
                            refresh();
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "保存失败");
                          }
                        }}
                        className="rounded bg-blue-500 px-2 py-1 text-xs text-white hover:bg-blue-600"
                      >
                        保存
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="rounded border px-2 py-1 text-xs hover:bg-slate-100"
                      >
                        取消
                      </button>
                    </span>
                  ) : (
                    <span className="flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setEditing(p.productName);
                          setDraft({ displayShort: p.displayShort, accentColor: p.accentColor });
                        }}
                        className="text-blue-600 hover:underline"
                      >
                        编辑
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm(`确认删除「${p.productName}」？`)) return;
                          try {
                            await deleteProduct({ productName: p.productName });
                            toast.success("已删除");
                            setProducts((prev) =>
                              prev.filter((x) => x.productName !== p.productName),
                            );
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "删除失败");
                          }
                        }}
                        className="text-red-500 hover:underline"
                      >
                        删除
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
          {products.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                暂无产品分类
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* 新建弹窗 */}
      {newOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setNewOpen(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-96 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl">
            <h2 className="mb-4 text-lg font-semibold">新建产品</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">产品名</label>
                <input
                  value={newDraft.productName}
                  onChange={(e) => setNewDraft({ ...newDraft, productName: e.target.value })}
                  placeholder="如：捕鱼大作战"
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">简称</label>
                <input
                  value={newDraft.displayShort}
                  onChange={(e) => setNewDraft({ ...newDraft, displayShort: e.target.value })}
                  placeholder="如：捕鱼"
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">主色（#RRGGBB）</label>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className="h-7 w-7 shrink-0 rounded border"
                    style={{ backgroundColor: newDraft.accentColor }}
                  />
                  <input
                    value={newDraft.accentColor}
                    onChange={(e) => setNewDraft({ ...newDraft, accentColor: e.target.value })}
                    className="w-full rounded border px-3 py-2 font-mono text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setNewOpen(false)}
                className="rounded border px-4 py-2 text-sm"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  try {
                    await createProduct(newDraft);
                    toast.success("已创建");
                    refresh();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "创建失败");
                  }
                }}
                className="rounded bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600"
              >
                确认
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
