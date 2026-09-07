"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { RecruitmentPipelineImportResult } from "@/modules/business-recruitment";

export function PipelineImportDialog({ onImported }: { onImported: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<RecruitmentPipelineImportResult | null>(null);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!file) return;
    setPending(true);
    setError("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/recruitment-center/import", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json()) as RecruitmentPipelineImportResult & {
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(body.error?.message ?? "导入失败");
      setResult(body);
      if (body.imported > 0) onImported();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "导入失败");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setFile(null);
          setResult(null);
          setError("");
        }
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Upload /> 导入邀约表
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>导入招聘历史数据</DialogTitle>
          <DialogDescription>
            上传钉钉《邀约面试表登记》导出的 Excel，系统自动识别“面试邀约表”并按源行去重。
          </DialogDescription>
        </DialogHeader>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="sr-only"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setResult(null);
            setError("");
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex min-h-24 w-full items-center gap-3 rounded-md border border-dashed px-4 text-left hover:bg-muted/40"
        >
          <FileSpreadsheet className="size-7 text-primary" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {file?.name ?? "选择 Excel 文件"}
            </span>
            <span className="block text-xs text-muted-foreground">支持 xlsx / xls，最大 10MB</span>
          </span>
        </button>
        {error && (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        {result && (
          <div className="rounded-md border bg-muted/20 p-3 text-sm">
            已导入 {result.imported} 行，跳过 {result.skipped} 行
            {result.issues.slice(0, 8).map((issue, index) => (
              <div key={`${issue.row}-${index}`} className="mt-1 text-xs text-muted-foreground">
                {issue.row ? `第 ${issue.row} 行：` : ""}
                {issue.message}
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            关闭
          </Button>
          <Button disabled={!file || pending} onClick={submit}>
            {pending ? <LoaderCircle className="animate-spin" /> : <Upload />} 开始导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
