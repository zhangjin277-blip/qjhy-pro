"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteFileAction,
  type RecordingFile,
  type StreamerFolder,
} from "@/modules/live-recording";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatSize(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024).toFixed(0)} KB`;
}

function mediaUrl(streamer: string, file: string, download = false): string {
  const q = new URLSearchParams({ streamer, file });
  if (download) q.set("download", "1");
  return `/api/live-recording/media?${q.toString()}`;
}

/**
 * mpegts.js 播放器:动态 import(浏览器专用),挂载时创建、卸载时销毁。
 * .ts 无内置时长/索引 → 传 filesize + seekType:"range" 让 mpegts.js 用 HTTP Range
 * 估算时长并按字节位置跳转(进度条可显示可拖动;定位为码率估算,非精确)。
 */
const PLAYBACK_RATES = [0.5, 1, 1.5, 2, 3];

function TsPreview({ src, size }: { src: string; size: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rate, setRate] = useState(1);

  function changeRate(r: number) {
    setRate(r);
    if (videoRef.current) videoRef.current.playbackRate = r;
  }

  useEffect(() => {
    let destroyed = false;
    let player: { destroy: () => void } | null = null;
    const video = videoRef.current;
    if (!video) return;
    void (async () => {
      try {
        const mod = await import("mpegts.js");
        const mpegts = mod.default;
        if (destroyed) return;
        if (!mpegts.isSupported()) {
          setErr("当前浏览器不支持在线预览,请下载后本地播放");
          return;
        }
        const p = mpegts.createPlayer(
          { type: "mpegts", url: src, isLive: false, filesize: size },
          { lazyLoad: true, seekType: "range", enableStashBuffer: false },
        );
        p.attachMediaElement(video);
        p.load();
        player = p;
      } catch {
        setErr("预览加载失败,请下载后本地播放");
      }
    })();
    return () => {
      destroyed = true;
      try {
        player?.destroy();
      } catch {
        /* ignore */
      }
    };
  }, [src, size]);

  if (err) {
    return <div className="p-6 text-center text-sm text-muted-foreground">{err}</div>;
  }
  return (
    <div className="space-y-2.5">
      <video
        ref={videoRef}
        controls
        onLoadedMetadata={() => {
          if (videoRef.current) videoRef.current.playbackRate = rate;
        }}
        className="max-h-[70vh] w-full rounded-md bg-black"
      />
      <div className="flex items-center justify-center gap-1.5">
        <span className="mr-1 text-xs text-slate-400">倍速</span>
        {PLAYBACK_RATES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => changeRate(r)}
            className={`rounded-md px-2 py-1 text-xs font-medium tabular-nums transition-colors ${
              rate === r
                ? "bg-primary text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {r}×
          </button>
        ))}
      </div>
      <p className="text-center text-xs text-slate-400">
        录像为直播流格式,进度条可拖动但定位为估算、可能有偏差;精确回看请下载后本地播放。
      </p>
    </div>
  );
}

export function RecordingFiles({
  folders,
  selected,
  files,
  rootError,
}: {
  folders: StreamerFolder[];
  selected: string | null;
  files: RecordingFile[];
  rootError: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RecordingFile | null>(null);
  const [previewFile, setPreviewFile] = useState<RecordingFile | null>(null);

  if (rootError) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
        录像目录不可访问,请检查 NAS 挂载与 RECORDINGS_DIR 配置。({rootError})
      </div>
    );
  }

  const totalSize = folders.reduce((s, f) => s + f.totalSize, 0);

  return (
    <div className="flex gap-5">
      <aside className="w-64 shrink-0">
        <div className="mb-2 px-1 text-xs font-medium text-slate-400">
          {folders.length} 个主播 · <span className="tabular-nums">{formatSize(totalSize)}</span>
        </div>
        <div className="space-y-0.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
          {folders.map((f) => {
            const active = f.name === selected;
            return (
              <button
                key={f.name}
                onClick={() => router.push(`/live-recording/files?s=${encodeURIComponent(f.name)}`)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  active ? "bg-primary/10 text-primary" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {f.recording && (
                    <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-red-500" />
                  )}
                  <span className={`truncate ${active ? "font-semibold" : ""}`}>{f.name}</span>
                </span>
                <span
                  className={`ml-2 shrink-0 text-xs tabular-nums ${active ? "text-primary/70" : "text-slate-400"}`}
                >
                  {f.fileCount} · {formatSize(f.totalSize)}
                </span>
              </button>
            );
          })}
          {folders.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-slate-400">暂无录像</div>
          )}
        </div>
      </aside>

      <div className="min-w-0 flex-1 space-y-3">
        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-100 hover:bg-transparent">
                <TableHead className="h-11 pl-5 text-xs font-medium text-slate-400">
                  文件名
                </TableHead>
                <TableHead className="h-11 w-28 text-xs font-medium text-slate-400">大小</TableHead>
                <TableHead className="h-11 w-44 text-xs font-medium text-slate-400">
                  修改时间
                </TableHead>
                <TableHead className="h-11 w-48 pr-5 text-xs font-medium text-slate-400">
                  操作
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((f) => (
                <TableRow
                  key={f.name}
                  className="border-slate-100 transition-colors hover:bg-slate-50/70"
                >
                  <TableCell className="max-w-0 truncate py-3 pl-5">
                    <span className="font-mono text-[13px] text-slate-700">{f.name}</span>
                    {f.recording && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">
                        <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
                        录制中
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-[13px] text-slate-600 tabular-nums">
                    {formatSize(f.size)}
                  </TableCell>
                  <TableCell className="text-[13px] text-slate-500 tabular-nums">
                    {new Date(f.mtimeMs).toLocaleString("zh-CN")}
                  </TableCell>
                  <TableCell className="pr-5">
                    <div className="flex gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={f.recording}
                        onClick={() => setPreviewFile(f)}
                      >
                        预览
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          if (selected) window.location.href = mediaUrl(selected, f.name, true);
                        }}
                      >
                        下载
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-slate-500 hover:bg-red-50 hover:text-red-600"
                        disabled={pending || f.recording}
                        onClick={() => setDeleteTarget(f)}
                      >
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {files.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="py-16 text-center text-sm text-slate-400">
                    该主播暂无录像文件
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* 预览 */}
      <Dialog open={previewFile !== null} onOpenChange={(o) => !o && setPreviewFile(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate font-mono text-sm">{previewFile?.name}</DialogTitle>
          </DialogHeader>
          {previewFile && selected && (
            <TsPreview src={mediaUrl(selected, previewFile.name)} size={previewFile.size} />
          )}
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={`删除「${deleteTarget?.name ?? ""}」?`}
        description={`${deleteTarget ? formatSize(deleteTarget.size) : ""} 将被物理删除,不可恢复。`}
        variant="danger"
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        onConfirm={() => {
          const t = deleteTarget;
          if (!t || !selected) return;
          startTransition(async () => {
            setError(null);
            const res = await deleteFileAction(selected, t.name);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            router.refresh();
          });
        }}
      />
    </div>
  );
}
