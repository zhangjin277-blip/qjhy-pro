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

/** mpegts.js 播放器:动态 import(浏览器专用),挂载时创建、卸载时销毁 */
function TsPreview({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);

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
        const p = mpegts.createPlayer({ type: "mpegts", url: src, isLive: false });
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
  }, [src]);

  if (err) {
    return <div className="p-6 text-center text-sm text-muted-foreground">{err}</div>;
  }
  return <video ref={videoRef} controls className="max-h-[70vh] w-full rounded-md bg-black" />;
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
    <div className="flex gap-6">
      <aside className="w-60 shrink-0 space-y-1">
        <div className="px-2 pb-2 text-xs text-muted-foreground">
          {folders.length} 个主播 · {formatSize(totalSize)}
        </div>
        {folders.map((f) => (
          <button
            key={f.name}
            onClick={() => router.push(`/live-recording/files?s=${encodeURIComponent(f.name)}`)}
            className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent ${
              f.name === selected ? "bg-accent font-medium" : ""
            }`}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {f.recording && <span className="size-1.5 shrink-0 rounded-full bg-red-500" />}
              <span className="truncate">{f.name}</span>
            </span>
            <span className="ml-2 shrink-0 text-xs text-muted-foreground">
              {f.fileCount} · {formatSize(f.totalSize)}
            </span>
          </button>
        ))}
        {folders.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">暂无录像</div>
        )}
      </aside>

      <div className="min-w-0 flex-1 space-y-3">
        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>文件名</TableHead>
              <TableHead className="w-24">大小</TableHead>
              <TableHead className="w-40">修改时间</TableHead>
              <TableHead className="w-52">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.map((f) => (
              <TableRow key={f.name}>
                <TableCell className="max-w-0 truncate font-mono text-xs">
                  {f.name}
                  {f.recording && (
                    <span className="ml-2 inline-flex items-center gap-1 text-red-600">
                      <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
                      录制中
                    </span>
                  )}
                </TableCell>
                <TableCell>{formatSize(f.size)}</TableCell>
                <TableCell>{new Date(f.mtimeMs).toLocaleString("zh-CN")}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={f.recording}
                      onClick={() => setPreviewFile(f)}
                    >
                      预览
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (selected) window.location.href = mediaUrl(selected, f.name, true);
                      }}
                    >
                      下载
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
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
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                  该主播暂无录像文件
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* 预览 */}
      <Dialog open={previewFile !== null} onOpenChange={(o) => !o && setPreviewFile(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate font-mono text-sm">{previewFile?.name}</DialogTitle>
          </DialogHeader>
          {previewFile && selected && <TsPreview src={mediaUrl(selected, previewFile.name)} />}
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
