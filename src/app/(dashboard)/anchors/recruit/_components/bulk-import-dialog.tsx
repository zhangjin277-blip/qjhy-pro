"use client";

import { useRef, useState } from "react";
import { Download, FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils/cn";

interface ImportIssue {
  row: number;
  message: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  issues: ImportIssue[];
}

export function BulkImportDialog({ onImported }: { onImported: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [defaultPlatform, setDefaultPlatform] = useState("douyin");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!file) {
      setError("请先选择 Excel 文件");
      return;
    }
    setPending(true);
    setError("");
    setResult(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("defaultPlatform", defaultPlatform);
      const response = await fetch("/api/business-recruitment/import", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json()) as ImportResult & {
        error?: { message?: string } | string;
      };
      if (!response.ok) {
        const message =
          typeof body.error === "string" ? body.error : body.error?.message || "批量导入失败";
        throw new Error(message);
      }
      setResult(body);
      if (body.imported > 0) onImported();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "批量导入失败");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) return;
        setFile(null);
        setResult(null);
        setError("");
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Upload />
        批量导入
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>批量导入主播</DialogTitle>
          <DialogDescription>
            支持原登记表和新版模板，按“平台 + 主播账号 ID”自动去重。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>原表默认平台</Label>
            <Select
              value={defaultPlatform}
              onValueChange={(value) => setDefaultPlatform(value ?? "douyin")}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value: string | null) =>
                    value === "kuaishou" ? "快手" : value === "other" ? "其他" : "抖音"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="douyin">抖音</SelectItem>
                <SelectItem value="kuaishou">快手</SelectItem>
                <SelectItem value="other">其他</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Excel 有“平台”列时优先使用表内值；原 26 列登记表没有平台列时使用这里的选择。
            </p>
          </div>

          <div className="space-y-2">
            <Label>导入文件</Label>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
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
              className="flex min-h-20 w-full items-center gap-3 rounded-md border border-dashed px-4 text-left hover:bg-muted/40"
            >
              <FileSpreadsheet className="size-6 text-primary" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {file?.name ?? "选择 Excel 或 CSV 文件"}
                </span>
                <span className="block text-xs text-muted-foreground">
                  最大 5MB，单次最多 500 行
                </span>
              </span>
            </button>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          {result && (
            <div className="space-y-2 rounded-md border bg-muted/20 p-3">
              <div className="text-sm font-medium">
                已导入 {result.imported} 行{result.skipped > 0 ? `，跳过 ${result.skipped} 行` : ""}
              </div>
              {result.issues.length > 0 && (
                <div className="max-h-32 overflow-y-auto text-xs text-muted-foreground">
                  {result.issues.map((issue, index) => (
                    <div key={`${issue.row}-${index}`}>
                      {issue.row > 0 ? `第 ${issue.row} 行：` : ""}
                      {issue.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <a
            href="/api/business-recruitment/import"
            className={cn(buttonVariants({ variant: "outline" }), "mr-auto")}
          >
            <Download />
            下载模板
          </a>
          <Button onClick={submit} disabled={!file || pending}>
            {pending ? <LoaderCircle className="animate-spin" /> : <Upload />}
            开始导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
