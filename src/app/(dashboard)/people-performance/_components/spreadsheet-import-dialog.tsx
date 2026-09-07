"use client";

import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function SpreadsheetImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!file) return;
    setPending(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/people-performance/bulk-import", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json().catch(() => null)) as {
        configured?: number;
        failed?: { name: string; reason: string }[];
        error?: { message?: string };
      } | null;
      if (!response.ok) throw new Error(payload?.error?.message ?? "批量导入失败");
      const failed = payload?.failed ?? [];
      if (failed.length > 0) {
        toast.warning(
          `已配置${payload?.configured ?? 0}人，${failed.length}人失败：${failed.map((item) => `${item.name}（${item.reason}）`).join("、")}`,
          { duration: 10000 },
        );
      } else {
        toast.success(`已完成${payload?.configured ?? 0}人的表格配置`);
      }
      router.refresh();
      setFile(null);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量导入失败");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>通过Excel批量配置</DialogTitle>
          <DialogDescription>
            每行填写一个目标，同一文件可为不同岗位人员配置不同上级、档案和考核目标。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Button
            variant="outline"
            onClick={() => window.location.assign("/api/people-performance/bulk-import")}
          >
            <Download />
            下载Excel模板
          </Button>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept=".xlsx,.xls"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            className="flex min-h-28 w-full items-center justify-center gap-3 rounded-md border border-dashed bg-slate-50 px-4 text-sm text-slate-700 hover:border-blue-300 hover:bg-blue-50/40"
            onClick={() => inputRef.current?.click()}
          >
            <FileSpreadsheet className="size-6 text-emerald-600" />
            <span>{file ? file.name : "选择填写完成的Excel文件"}</span>
          </button>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={pending || !file} onClick={submit}>
            <Upload />
            {pending ? "导入中..." : "开始导入"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
