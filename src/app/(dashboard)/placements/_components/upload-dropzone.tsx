"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DATASET_LABEL, type DatasetId } from "@/modules/placement";

export function UploadDropzone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const datasetRef = useRef<DatasetId>("product_buyu");
  const [dataset, setDataset] = useState<DatasetId>("product_buyu");
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [batches, setBatches] = useState<{ name: string; result: unknown }[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // 同步 dataset 到 ref（uploadFiles 异步调用时拿最新值）
  useEffect(() => {
    datasetRef.current = dataset;
  }, [dataset]);

  // 阻止整个窗口的默认拖拽（否则掉到 dropzone 外会被浏览器直接打开）
  useEffect(() => {
    const stop = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) {
        e.preventDefault();
      }
    };
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", stop);
    };
  }, []);

  async function uploadFiles(filesToUpload: File[]) {
    if (filesToUpload.length === 0 || uploading) return;
    setUploading(true);
    setBatches([]);
    setProgress({ done: 0, total: filesToUpload.length });
    const ds = datasetRef.current;
    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i];
      if (!file) continue;
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dataset_id", ds);
      try {
        const res = await fetch("/api/placements/upload", { method: "POST", body: fd });
        const result = await res.json();
        setBatches((prev) => [...prev, { name: file.name, result }]);
      } catch (err) {
        setBatches((prev) => [...prev, { name: file.name, result: { error: String(err) } }]);
      }
      setProgress({ done: i + 1, total: filesToUpload.length });
    }
    setUploading(false);
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium">产品：</label>
        <select
          value={dataset}
          onChange={(e) => setDataset(e.target.value as DatasetId)}
          disabled={uploading}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {(Object.keys(DATASET_LABEL) as DatasetId[]).map((k) => (
            <option key={k} value={k}>
              {DATASET_LABEL[k]}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-400">拖入或选择 Excel 后立即上传</span>
      </div>

      <div
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dragCounter.current += 1;
          if (e.dataTransfer.types.includes("Files")) setDragActive(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dragCounter.current -= 1;
          if (dragCounter.current <= 0) {
            dragCounter.current = 0;
            setDragActive(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dragCounter.current = 0;
          setDragActive(false);
          const dropped = Array.from(e.dataTransfer.files).filter((f) =>
            f.name.match(/\.(xlsx|xls)$/i),
          );
          if (dropped.length > 0) {
            void uploadFiles(dropped);
          }
        }}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`cursor-pointer select-none rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
          dragActive
            ? "border-blue-500 bg-blue-50"
            : uploading
              ? "border-slate-300 bg-slate-50"
              : "border-slate-300 bg-white hover:border-blue-300 hover:bg-blue-50/40"
        }`}
      >
        {uploading && progress ? (
          <div className="pointer-events-none">
            <p className="text-[15px] font-medium text-blue-600">
              上传中 {progress.done} / {progress.total}
            </p>
            <p className="mt-1 text-xs text-slate-400">请勿关闭页面</p>
          </div>
        ) : dragActive ? (
          <div className="pointer-events-none">
            <p className="text-[15px] font-semibold text-blue-600">松开鼠标开始上传</p>
            <p className="mt-1 text-xs text-blue-500">仅 .xlsx / .xls 文件会被接受</p>
          </div>
        ) : (
          <div className="pointer-events-none">
            <p className="text-[15px] font-medium text-slate-600">拖拽 Excel 文件到此处自动上传</p>
            <p className="mt-1 text-xs text-slate-400">
              支持 .xlsx / .xls，可多选；点击此区域也可选择文件
            </p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          multiple
          disabled={uploading}
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            if (picked.length > 0) void uploadFiles(picked);
          }}
          className="hidden"
        />
      </div>

      {batches.length > 0 && (
        <div className="space-y-2">
          {batches.map((b, i) => {
            const r = b.result as { ok?: boolean; error?: string } & Record<string, unknown>;
            const ok = !r.error;
            return (
              <div
                key={i}
                className={`rounded-lg border p-3 text-sm ${
                  ok ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                <strong>{b.name}</strong>
                <span className="ml-2 text-xs text-slate-500">
                  {ok ? "上传成功" : `失败：${r.error}`}
                </span>
                {ok && (
                  <pre className="mt-1 overflow-x-auto text-[11px] text-slate-500">
                    {JSON.stringify(b.result, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
