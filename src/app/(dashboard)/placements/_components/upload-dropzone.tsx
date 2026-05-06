"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DATASET_LABEL, type DatasetId } from "@/modules/placement";

export function UploadDropzone() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [dataset, setDataset] = useState<DatasetId>("product_buyu");
  const [uploading, setUploading] = useState(false);
  const [batches, setBatches] = useState<{ name: string; result: unknown }[]>([]);

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setBatches([]);
    for (const file of files) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dataset_id", dataset);
      const res = await fetch("/api/placements/upload", { method: "POST", body: fd });
      const result = await res.json();
      setBatches((prev) => [...prev, { name: file.name, result }]);
    }
    setUploading(false);
    setFiles([]);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium">产品：</label>
        <select
          value={dataset}
          onChange={(e) => setDataset(e.target.value as DatasetId)}
          className="rounded border border-slate-200 px-3 py-1.5 text-sm"
        >
          {(Object.keys(DATASET_LABEL) as DatasetId[]).map((k) => (
            <option key={k} value={k}>
              {DATASET_LABEL[k]}
            </option>
          ))}
        </select>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const dropped = Array.from(e.dataTransfer.files);
          setFiles((prev) => [...prev, ...dropped]);
        }}
        className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-12 text-center"
      >
        <p className="text-slate-500">拖拽 Excel 文件到此（.xlsx，可多选）</p>
        <input
          type="file"
          accept=".xlsx,.xls"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="mt-3"
        />
      </div>

      {files.length > 0 && (
        <div className="rounded border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-medium mb-2">待上传（{files.length}）：</p>
          <ul className="text-sm space-y-1">
            {files.map((f, i) => (
              <li key={i} className="flex justify-between">
                <span>{f.name}</span>
                <span className="text-slate-400">{(f.size / 1024).toFixed(1)} KB</span>
              </li>
            ))}
          </ul>
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="mt-3 rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {uploading ? "上传中…" : "确认上传"}
          </button>
        </div>
      )}

      {batches.length > 0 && (
        <div className="space-y-2">
          {batches.map((b, i) => (
            <div key={i} className="rounded border border-green-200 bg-green-50 p-3 text-sm">
              <strong>{b.name}</strong> — {JSON.stringify(b.result)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
