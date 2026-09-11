"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTask } from "@/modules/editing-task";
import { searchLiveAccounts, type AccountSearchResult } from "../actions";
import type { ProductOption } from "@/modules/product-config";
import { toast } from "sonner";

interface Props {
  onClose: () => void;
  products: ProductOption[];
}

function createUploadId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function NewTaskDialog({ onClose }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<AccountSearchResult[]>([]);
  const [selected, setSelected] = useState<AccountSearchResult | null>(null);
  const [anchorId, setAnchorId] = useState<string>("");
  const [materialDate, setMaterialDate] = useState(new Date().toISOString().slice(0, 10));
  const [remark, setRemark] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<"independent" | "merged">("independent");
  const [priority, setPriority] = useState<"normal" | "urgent">("normal");
  const [urgentReason, setUrgentReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
    percent?: number;
  } | null>(null);

  // 前端读取视频时长（秒），失败返回 null（不阻塞上传）
  function readVideoDurationSec(f: File): Promise<number | null> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(f);
      const v = document.createElement("video");
      v.preload = "metadata";
      const done = (val: number | null) => {
        URL.revokeObjectURL(url);
        resolve(val);
      };
      v.onloadedmetadata = () =>
        done(Number.isFinite(v.duration) && v.duration > 0 ? Math.round(v.duration) : null);
      v.onerror = () => done(null);
      v.src = url;
    });
  }

  async function uploadFileToTask(taskId: number, f: File): Promise<void> {
    const durationSec = await readVideoDurationSec(f);
    const uploadId = createUploadId();
    const chunkBytes = 32 * 1024 * 1024;
    let offset = 0;
    try {
      while (offset < f.size) {
        const chunk = f.slice(offset, Math.min(offset + chunkBytes, f.size));
        const res = await fetch("/api/editing/upload-source", {
          method: "PUT",
          headers: {
            "x-upload-id": uploadId,
            "x-upload-offset": String(offset),
            "x-upload-chunk-bytes": String(chunk.size),
          },
          body: chunk,
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          nextOffset?: number;
        };
        if (!res.ok || json.nextOffset == null) throw new Error(json.error ?? "素材分片上传失败");
        offset = json.nextOffset;
        setProgress((current) =>
          current ? { ...current, percent: Math.round((offset / f.size) * 100) } : current,
        );
      }

      const res = await fetch("/api/editing/upload-source", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          uploadId,
          taskId,
          fileName: f.name,
          fileBytes: f.size,
          durationSec,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? "素材上传完成处理失败");
      }
    } catch (error) {
      await fetch(`/api/editing/upload-source?uploadId=${encodeURIComponent(uploadId)}`, {
        method: "DELETE",
      }).catch(() => undefined);
      throw error;
    }
  }

  async function doCreate(): Promise<void> {
    if (!selected) return;
    let succeeded = 0;
    let failed = 0;

    if (mode === "independent" || files.length === 1) {
      setProgress({ done: 0, total: files.length, percent: 0 });
      let idx = 0;
      for (const f of files) {
        try {
          const result = await createTask({
            liveAccountId: selected.id,
            anchorId: anchorId || null,
            materialDate,
            sourceRemark: remark.trim() || null,
            priority,
            urgentReason: priority === "urgent" ? urgentReason.trim() || null : null,
          });

          await uploadFileToTask(result.taskId, f);
          succeeded++;
        } catch (err) {
          failed++;
          toast.error(`${f.name}: ${err instanceof Error ? err.message : "失败"}`);
        }
        idx++;
        setProgress({ done: idx, total: files.length, percent: undefined });
      }
    } else {
      // merged mode: 1 个任务，所有文件上传到它
      try {
        const result = await createTask({
          liveAccountId: selected.id,
          anchorId: anchorId || null,
          materialDate,
          sourceRemark: remark.trim() || null,
          priority,
          urgentReason: priority === "urgent" ? urgentReason.trim() || null : null,
        });

        setProgress({ done: 0, total: files.length, percent: 0 });
        let idx = 0;
        for (const f of files) {
          try {
            await uploadFileToTask(result.taskId, f);
            succeeded++;
          } catch (err) {
            failed++;
            toast.error(`${f.name}: ${err instanceof Error ? err.message : "失败"}`);
          }
          idx++;
          setProgress({ done: idx, total: files.length, percent: undefined });
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "创建任务失败");
        failed = files.length;
      }
    }

    if (succeeded > 0) {
      toast.success(`成功 ${succeeded} 条${failed > 0 ? ` · 失败 ${failed} 条` : ""}`);
    }
    setSubmitting(false);
    if (succeeded > 0) {
      onClose();
      router.refresh(); // 软刷新看板数据，保留成功提示，不整页 reload
    }
  }

  async function submit() {
    if (!selected || files.length === 0) return;
    // 捕鱼系任务强制选主播（用于文件规则化命名）
    if (selected.product.includes("捕鱼") && !anchorId) {
      toast.error("捕鱼系任务必须选择主播");
      return;
    }
    setSubmitting(true);
    await doCreate();
  }

  const buttonLabel =
    submitting && progress
      ? `上传 ${progress.done}/${progress.total}${progress.percent == null ? "" : ` · ${progress.percent}%`} ...`
      : submitting
        ? "创建中..."
        : "创建并上传";

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={() => {
          if (!submitting) onClose(); // 上传中不允许点遮罩关闭，防误触中断
        }}
      />
      <div className="fixed left-1/2 top-1/2 z-50 w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl">
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">新建剪辑任务</h2>
          <button
            onClick={() => {
              if (!submitting) onClose();
            }}
            disabled={submitting}
            className="text-2xl leading-none text-slate-400 hover:text-slate-700 disabled:opacity-40"
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
              <label className="text-sm font-medium">
                主播
                {selected.product.includes("捕鱼") && <span className="ml-1 text-red-500">*</span>}
              </label>
              <select
                value={anchorId}
                onChange={(e) => setAnchorId(e.target.value)}
                disabled={selected.defaultAnchors.length === 1 && !!selected.defaultAnchors[0]}
                className="mt-1 w-full rounded border border-border px-3 py-2 text-sm disabled:opacity-60"
              >
                <option value="">
                  {selected.product.includes("捕鱼") ? "请选择主播（必填）" : "（不指定主播）"}
                </option>
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
            <label className="text-sm font-medium">优先级</label>
            <div className="mt-1 flex gap-3">
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  checked={priority === "normal"}
                  onChange={() => setPriority("normal")}
                />
                <span>正常</span>
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  checked={priority === "urgent"}
                  onChange={() => setPriority("urgent")}
                />
                <span className="font-medium text-red-600">🔴 紧急</span>
              </label>
            </div>
            {priority === "urgent" && (
              <textarea
                value={urgentReason}
                onChange={(e) => setUrgentReason(e.target.value)}
                placeholder="紧急原因（例：当晚必须发布 / 与活动联动，可选）"
                rows={2}
                className="mt-2 w-full rounded border border-border px-2 py-1 text-sm"
              />
            )}
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
            <div className="mb-1.5 text-sm font-semibold">
              素材文件 <span className="text-red-500">*</span>
            </div>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/50 py-6 transition hover:border-blue-400 hover:bg-blue-50/30">
              <input
                type="file"
                accept="video/*"
                multiple
                hidden
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  setFiles(picked);
                  if (picked.length < 2) setMode("independent");
                }}
              />
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-slate-400"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="text-sm text-slate-500">点击选择素材视频（可多选）</span>
              {files.length > 0 && (
                <span className="text-xs text-blue-600">
                  {files.length === 1 && files[0]
                    ? `${files[0].name} · ${Math.round(files[0].size / 1024 / 1024)} MB`
                    : `已选 ${files.length} 个文件 · 合计 ${Math.round(files.reduce((s, f) => s + f.size, 0) / 1024 / 1024)} MB`}
                </span>
              )}
            </label>
          </div>

          {files.length >= 2 && (
            <div className="rounded border border-border bg-slate-50 px-3 py-2.5 space-y-2">
              <p className="text-xs font-medium text-slate-500">多文件模式</p>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="upload-mode"
                  checked={mode === "independent"}
                  onChange={() => setMode("independent")}
                  className="accent-blue-500"
                />
                每个文件独立任务（建 {files.length} 条任务）
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="upload-mode"
                  checked={mode === "merged"}
                  onChange={() => setMode("merged")}
                  className="accent-blue-500"
                />
                合并到一个任务（{files.length} 个素材文件）
              </label>
            </div>
          )}
        </div>

        <footer className="mt-6 flex justify-end gap-2 border-t pt-4">
          <button
            onClick={onClose}
            className="rounded border border-border px-4 py-2 text-sm hover:bg-slate-50"
          >
            取消
          </button>
          <button
            disabled={!selected || files.length === 0 || submitting}
            onClick={submit}
            className="rounded bg-blue-500 px-4 py-2 text-sm text-white disabled:opacity-50 hover:bg-blue-600"
          >
            {buttonLabel}
          </button>
        </footer>
      </div>
    </>
  );
}
