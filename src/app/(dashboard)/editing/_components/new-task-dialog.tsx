"use client";
import { useState } from "react";
import { createTask } from "@/modules/editing-task";
import { searchLiveAccounts, type AccountSearchResult } from "../actions";
import type { ProductOption } from "@/modules/product-config";
import { toast } from "sonner";

interface Props {
  onClose: () => void;
  products: ProductOption[];
}

export function NewTaskDialog({ onClose }: Props) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<AccountSearchResult[]>([]);
  const [selected, setSelected] = useState<AccountSearchResult | null>(null);
  const [anchorId, setAnchorId] = useState<string>("");
  const [materialDate, setMaterialDate] = useState(new Date().toISOString().slice(0, 10));
  const [remark, setRemark] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl">
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">新建剪辑任务</h2>
          <button
            onClick={onClose}
            className="text-2xl leading-none text-slate-400 hover:text-slate-700"
          >
            ×
          </button>
        </header>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">账号</label>
            <input
              type="text"
              value={query}
              onChange={async (e) => {
                setQuery(e.target.value);
                setSelected(null);
                if (e.target.value.length >= 1) {
                  setCandidates(await searchLiveAccounts(e.target.value));
                } else {
                  setCandidates([]);
                }
              }}
              placeholder="搜索账号昵称"
              className="mt-1 w-full rounded border border-border px-3 py-2 text-sm"
            />
            {!selected && candidates.length > 0 && (
              <ul className="mt-1 max-h-40 overflow-auto rounded border border-border">
                {candidates.map((a) => (
                  <li
                    key={a.id}
                    onClick={() => {
                      setSelected(a);
                      setQuery(a.name);
                      if (a.defaultAnchors.length === 1 && a.defaultAnchors[0]) {
                        setAnchorId(a.defaultAnchors[0].anchorId);
                      } else {
                        setAnchorId("");
                      }
                      setCandidates([]);
                    }}
                    className="cursor-pointer px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    {a.name} <span className="text-xs text-slate-400">· {a.product}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {selected && (
            <div>
              <label className="text-sm font-medium">主播</label>
              <select
                value={anchorId}
                onChange={(e) => setAnchorId(e.target.value)}
                disabled={selected.defaultAnchors.length === 1 && !!selected.defaultAnchors[0]}
                className="mt-1 w-full rounded border border-border px-3 py-2 text-sm disabled:opacity-60"
              >
                <option value="">（不指定主播）</option>
                {selected.defaultAnchors.map((a) => (
                  <option key={a.anchorId} value={a.anchorId}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-sm font-medium">素材日期</label>
            <input
              type="date"
              value={materialDate}
              onChange={(e) => setMaterialDate(e.target.value)}
              className="mt-1 w-full rounded border border-border px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium">剪辑要求</label>
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={3}
              placeholder="（可空）"
              className="mt-1 w-full rounded border border-border px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium">素材文件</label>
            <input
              type="file"
              accept="video/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm"
            />
            {file && (
              <p className="mt-1 text-xs text-slate-500">
                {file.name} ({Math.round(file.size / 1024 / 1024)} MB)
              </p>
            )}
          </div>
        </div>

        <footer className="mt-6 flex justify-end gap-2 border-t pt-4">
          <button
            onClick={onClose}
            className="rounded border border-border px-4 py-2 text-sm hover:bg-slate-50"
          >
            取消
          </button>
          <button
            disabled={!selected || !file || submitting}
            onClick={async () => {
              if (!selected || !file) return;
              setSubmitting(true);
              try {
                const { taskId } = await createTask({
                  liveAccountId: selected.id,
                  anchorId: anchorId || null,
                  materialDate,
                  sourceRemark: remark.trim() || null,
                });
                const fd = new FormData();
                fd.append("taskId", String(taskId));
                fd.append("file", file);
                const res = await fetch("/api/editing/upload-source", {
                  method: "POST",
                  body: fd,
                });
                if (!res.ok) {
                  const j = await res.json().catch(() => ({}));
                  throw new Error((j as { error?: string }).error ?? "素材上传失败");
                }
                toast.success("任务创建成功");
                onClose();
                location.reload();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "创建失败");
              } finally {
                setSubmitting(false);
              }
            }}
            className="rounded bg-blue-500 px-4 py-2 text-sm text-white disabled:opacity-50 hover:bg-blue-600"
          >
            {submitting ? "创建中..." : "创建并上传"}
          </button>
        </footer>
      </div>
    </>
  );
}
