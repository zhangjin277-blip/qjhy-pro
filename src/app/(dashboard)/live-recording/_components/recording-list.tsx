"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addStreamerAction,
  removeStreamerAction,
  renameStreamerAction,
  setPausedAction,
  type StreamerView,
} from "@/modules/live-recording";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

function formatSize(n: number): string {
  if (n >= 1024 ** 4) return `${(n / 1024 ** 4).toFixed(2)} TB`;
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  return `${(n / 1024).toFixed(0)} KB`;
}

export function RecordingList({
  streamers,
  loadError,
}: {
  streamers: StreamerView[];
  loadError: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // 添加对话框
  const [addOpen, setAddOpen] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [addName, setAddName] = useState("");
  // 改名对话框
  const [renameTarget, setRenameTarget] = useState<StreamerView | null>(null);
  const [renameValue, setRenameValue] = useState("");
  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<StreamerView | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "操作失败");
        return;
      }
      after?.();
      router.refresh();
    });

  return (
    <div className="space-y-4">
      {loadError && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          {loadError}(请检查 URLS_FILE / RECORDINGS_DIR 配置与 NAS 挂载)
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">共 {streamers.length} 个录制主播</div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push("/live-recording/files")}>
            录像文件
          </Button>
          <Button
            onClick={() => {
              setAddUrl("");
              setAddName("");
              setAddOpen(true);
            }}
          >
            添加主播
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {streamers.map((s) => (
          <div key={s.index} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{s.name || s.url}</div>
                <div className="truncate text-xs text-muted-foreground">{s.url}</div>
              </div>
              {s.recording ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-red-600">
                  <span className="size-2 animate-pulse rounded-full bg-red-500" />
                  录制中
                </span>
              ) : s.paused ? (
                <span className="shrink-0 text-xs text-muted-foreground">已暂停</span>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">监控中</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {s.fileCount} 个录像 · {formatSize(s.totalSize)}
            </div>
            <div className="flex flex-wrap gap-2 border-t pt-3">
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => run(() => setPausedAction(s.index, !s.paused))}
              >
                {s.paused ? "恢复" : "暂停"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setRenameValue(s.name);
                  setRenameTarget(s);
                }}
              >
                改名
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => setDeleteTarget(s)}
              >
                删除
              </Button>
            </div>
          </div>
        ))}
        {streamers.length === 0 && !loadError && (
          <div className="col-span-full rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            暂无录制主播,点「添加主播」加入名单
          </div>
        )}
      </div>

      {/* 添加主播 */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加录制主播</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={addUrl}
              onChange={(e) => setAddUrl(e.target.value)}
              placeholder="粘贴直播间链接(如 https://live.douyin.com/xxxx)"
            />
            <Input
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="主播名(可选,留空则由录制器识别)"
            />
          </div>
          <DialogFooter>
            <Button
              disabled={pending || !addUrl.trim()}
              onClick={() =>
                run(
                  () => addStreamerAction(addUrl.trim(), addName.trim()),
                  () => setAddOpen(false),
                )
              }
            >
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 改名 */}
      <Dialog open={renameTarget !== null} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改主播名</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="主播名"
          />
          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() => {
                const t = renameTarget;
                if (!t) return;
                run(
                  () => renameStreamerAction(t.index, renameValue.trim()),
                  () => setRenameTarget(null),
                );
              }}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={`从名单删除「${deleteTarget?.name || deleteTarget?.url || ""}」?`}
        description="仅从录制名单移除,已录制的视频文件不受影响。"
        variant="danger"
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        onConfirm={() => {
          const t = deleteTarget;
          if (!t) return;
          run(() => removeStreamerAction(t.index));
        }}
      />
    </div>
  );
}
