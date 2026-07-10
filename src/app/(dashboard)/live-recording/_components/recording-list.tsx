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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatSize(n: number): string {
  if (n >= 1024 ** 4) return `${(n / 1024 ** 4).toFixed(2)} TB`;
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  return `${(n / 1024).toFixed(0)} KB`;
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}小时${pad(m)}分${pad(s)}秒` : `${pad(m)}分${pad(s)}秒`;
}

/** 封面缩略图(16:9):有则显图,加载失败/无封面显占位 */
function CoverThumb({ s }: { s: StreamerView }) {
  const [failed, setFailed] = useState(false);
  const showImg = s.hasCover && s.platform && s.roomId && !failed;
  if (showImg) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 录制器动态封面,尺寸不定
      <img
        src={`/api/live-recording/cover?platform=${encodeURIComponent(s.platform)}&room=${encodeURIComponent(s.roomId)}`}
        alt=""
        className="h-[52px] w-[92px] shrink-0 rounded-lg object-cover ring-1 ring-slate-900/5"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className="flex h-[52px] w-[92px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg bg-slate-50 text-[11px] text-slate-400 ring-1 ring-slate-900/5">
      <span className="text-base leading-none opacity-40">▷</span>
      {s.hasCover ? "无画面" : "封面失效"}
    </div>
  );
}

/** 监听开关(主蓝=监听中,灰=已暂停) */
function MonitorSwitch({
  on,
  disabled,
  onToggle,
}: {
  on: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      className={`relative inline-flex h-[22px] w-10 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-40 ${
        on ? "bg-primary" : "bg-slate-200"
      }`}
    >
      <span
        className={`inline-block size-[18px] rounded-full bg-white shadow-sm ring-1 ring-slate-900/5 transition-transform duration-200 ${
          on ? "translate-x-[20px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
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

  const [addOpen, setAddOpen] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [addName, setAddName] = useState("");
  const [renameTarget, setRenameTarget] = useState<StreamerView | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<StreamerView | null>(null);

  const recordingCount = streamers.filter((s) => s.recording).length;
  const monitoringCount = streamers.filter((s) => !s.paused && !s.recording).length;

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

      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-800">录制名单</h1>
          <div className="mt-1.5 flex items-center gap-4 text-[13px] text-slate-500">
            <span>
              总计 <b className="font-semibold text-slate-700 tabular-nums">{streamers.length}</b>
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              监控中{" "}
              <b className="font-semibold text-emerald-600 tabular-nums">{monitoringCount}</b>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-red-500" />
              录制中 <b className="font-semibold text-red-500 tabular-nums">{recordingCount}</b>
            </span>
          </div>
        </div>
        <Button
          onClick={() => {
            setAddUrl("");
            setAddName("");
            setAddOpen(true);
          }}
        >
          + 添加主播
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-100 hover:bg-transparent">
              <TableHead className="h-11 pl-5 text-xs font-medium text-slate-400">
                主播及画面
              </TableHead>
              <TableHead className="h-11 w-28 text-xs font-medium text-slate-400">
                直播链接
              </TableHead>
              <TableHead className="h-11 w-64 text-xs font-medium text-slate-400">
                录制状态
              </TableHead>
              <TableHead className="h-11 w-24 text-center text-xs font-medium text-slate-400">
                监听状态
              </TableHead>
              <TableHead className="h-11 w-28 pr-5 text-xs font-medium text-slate-400">
                操作
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {streamers.map((s) => (
              <TableRow
                key={s.index}
                className="border-slate-100 transition-colors hover:bg-slate-50/70"
              >
                <TableCell className="py-3 pl-5">
                  <div className="flex items-center gap-3.5">
                    <CoverThumb s={s} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[15px] font-semibold text-slate-800">
                          {s.name || s.roomId}
                        </span>
                        <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                          {s.platformName}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-slate-400 tabular-nums">
                        {s.fileCount} 个录像 · {formatSize(s.totalSize)}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[13px] font-medium text-primary hover:underline"
                  >
                    前往房间 ↗
                  </a>
                </TableCell>
                <TableCell>
                  {s.recording ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 py-1 pl-2 pr-2.5 text-xs font-medium text-emerald-700">
                      <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                      正在录制
                      <span className="font-normal text-emerald-600/80 tabular-nums">
                        {formatDuration(s.durationSec)} · {formatSize(s.currentSize)}
                      </span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[13px] text-slate-400">
                      <span className="size-1.5 rounded-full bg-slate-300" />
                      {s.paused ? "已暂停" : "未在录制"}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <MonitorSwitch
                    on={!s.paused}
                    disabled={pending}
                    onToggle={() => run(() => setPausedAction(s.index, !s.paused))}
                  />
                </TableCell>
                <TableCell className="pr-5">
                  <div className="flex gap-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-slate-500 hover:text-slate-800"
                      disabled={pending}
                      onClick={() => {
                        setRenameValue(s.name);
                        setRenameTarget(s);
                      }}
                    >
                      改名
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-slate-500 hover:bg-red-50 hover:text-red-600"
                      disabled={pending}
                      onClick={() => setDeleteTarget(s)}
                    >
                      删除
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {streamers.length === 0 && !loadError && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  暂无录制主播,点右上角「添加主播」加入名单
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
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
              placeholder="粘贴抖音或快手直播间链接"
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
        title={`从名单删除「${deleteTarget?.name || deleteTarget?.roomId || ""}」?`}
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
