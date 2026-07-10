"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Clock, Film, HardDrive, Pause, Play, Plus, Settings, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addStreamer,
  controlStreamer,
  fetchRecorderSnapshot,
  updateRecorderConfig,
  type ActionResult,
  type BuiltinTask,
  type RecorderSnapshot,
} from "@/modules/recording";

const POLL_MS = 10_000;

function formatDiskFree(bytes: number | null): string {
  if (bytes === null) return "-";
  const gb = bytes / 1024 ** 3;
  return gb >= 1024 ? `${(gb / 1024).toFixed(2)} TB` : `${gb.toFixed(1)} GB`;
}

/** 引擎已把体积格式化成 "549.43 GB"；拆成数字/单位以便强调数字。 */
function splitSize(s: string): { num: string; unit: string } {
  const m = /^([\d.,]+)\s*(.*)$/.exec(s.trim());
  if (!m) return { num: s, unit: "" };
  return { num: m[1] ?? s, unit: m[2] ?? "" };
}

type StatusTone = "recording" | "paused" | "error" | "idle";

function statusTone(t: BuiltinTask): StatusTone {
  if (t.status.includes("录制中")) return "recording";
  if (t.is_paused) return "paused";
  if (t.status.includes("异常")) return "error";
  return "idle";
}

/** 首字渐变头像：按主播名哈希取固定渐变，与软件库同一套语言。 */
const AVATAR_GRADIENTS = [
  "from-sky-400 to-blue-600",
  "from-violet-400 to-purple-600",
  "from-emerald-400 to-teal-600",
  "from-amber-400 to-orange-500",
  "from-rose-400 to-pink-600",
  "from-cyan-400 to-sky-600",
  "from-indigo-400 to-violet-600",
  "from-lime-400 to-green-600",
] as const;

function avatarGradient(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length] ?? "from-sky-400 to-blue-600";
}

function avatarChar(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? "?";
}

const PLATFORM_SHORT: Record<string, string> = {
  Douyin: "抖",
  Kuaishou: "快",
  Bilibili: "哔",
  Huya: "虎",
  Douyu: "斗",
  Xiaohongshu: "红",
};

function platformShort(p: string): string {
  return PLATFORM_SHORT[p] ?? [...p][0]?.toUpperCase() ?? "?";
}

export function RecordingTasks({
  initialSnapshot,
  canEdit,
}: {
  initialSnapshot: RecorderSnapshot;
  canEdit: boolean;
}) {
  const [snap, setSnap] = useState(initialSnapshot);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [addOpen, setAddOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BuiltinTask | null>(null);

  const refresh = useCallback(() => {
    fetchRecorderSnapshot()
      .then(setSnap)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // 写操作走判别式返回：{ ok:false, error } 不再 throw（生产 Server Action 会脱敏 message）。
  const run = useCallback(
    (fn: () => Promise<ActionResult>, onSuccess?: () => void) => {
      startTransition(async () => {
        setError(null);
        const res = await fn();
        if (!res.ok) {
          setError(res.error);
          return;
        }
        onSuccess?.();
        refresh();
      });
    },
    [refresh],
  );

  return (
    <div className="p-4">
      {!snap.online && (
        <div className="border-amber-300 bg-amber-50 text-amber-700 mb-3 rounded-lg border px-4 py-2.5 text-[13px]">
          录制器离线，任务管理暂不可用（下方为最后一次成功拉取的快照）。
        </div>
      )}
      {error && (
        <div className="border-destructive/30 bg-destructive/10 text-destructive mb-3 rounded-lg border px-4 py-2.5 text-[13px]">
          {error}
        </div>
      )}

      <div className="bg-card rounded-xl border">
        {/* 顶部状态条 */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
          <OnlineBadge online={snap.online} />
          <span className="text-muted-foreground flex items-center gap-1.5 text-[13px]">
            <HardDrive className="size-3.5" />
            NAS 剩余{" "}
            <b className="text-foreground font-semibold tabular-nums">
              {formatDiskFree(snap.diskFree)}
            </b>
          </span>
          <span className="bg-border h-4 w-px" />
          <span className="text-muted-foreground text-[13px]">
            共 <b className="text-foreground font-semibold tabular-nums">{snap.tasks.length}</b>{" "}
            个任务
          </span>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/recording/files"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <Film className="size-3.5" />
              录像文件
            </Link>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
                <Settings className="size-3.5" />
                录制设置
              </Button>
            )}
            {canEdit && (
              <Button size="sm" disabled={!snap.online} onClick={() => setAddOpen(true)}>
                <Plus className="size-3.5" />
                添加主播
              </Button>
            )}
          </div>
        </div>

        {/* 卡片网格 */}
        {snap.tasks.length === 0 ? (
          <div className="text-muted-foreground flex h-48 items-center justify-center text-sm">
            暂无录制任务
          </div>
        ) : (
          <div
            className={cn(
              "grid grid-cols-1 gap-3.5 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4",
              pending && "opacity-70",
            )}
          >
            {snap.tasks.map((t) => (
              <TaskCard
                key={`${t.platform}_${t.room_id}`}
                task={t}
                canEdit={canEdit}
                disabled={pending || !snap.online}
                onToggle={() =>
                  run(() =>
                    controlStreamer({
                      action: t.is_paused ? "resume" : "pause",
                      platform: t.platform,
                      roomId: t.room_id,
                    }),
                  )
                }
                onDelete={() => setDeleteTarget(t)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 添加主播 */}
      {canEdit && <AddDialog open={addOpen} onOpenChange={setAddOpen} onDone={refresh} />}

      {/* 录制设置 */}
      {canEdit && <ConfigDialog open={configOpen} onOpenChange={setConfigOpen} onDone={refresh} />}

      {/* 删除确认 */}
      <ConfirmDialog
        open={deleteTarget != null}
        title={`删除录制任务「${deleteTarget?.anchor_name || deleteTarget?.room_id || ""}」？`}
        description="仅从录制名单移除，已录文件不受影响。"
        confirmText="删除任务"
        variant="danger"
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          run(() =>
            controlStreamer({
              action: "delete",
              platform: deleteTarget.platform,
              roomId: deleteTarget.room_id,
            }),
          );
        }}
      />
    </div>
  );
}

function OnlineBadge({ online }: { online: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium",
        online ? "bg-emerald-50 text-emerald-600" : "bg-muted text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          online ? "animate-pulse bg-emerald-500" : "bg-muted-foreground/50",
        )}
      />
      录制器 · {online ? "在线" : "离线"}
    </span>
  );
}

const BADGE_TONE: Record<StatusTone, string> = {
  recording: "bg-red-50 text-red-600",
  error: "bg-amber-50 text-amber-600",
  paused: "text-muted-foreground border bg-transparent",
  idle: "bg-muted text-muted-foreground",
};

const DOT_TONE: Record<StatusTone, string> = {
  recording: "animate-pulse bg-red-500",
  error: "animate-pulse bg-amber-500",
  paused: "bg-muted-foreground/40",
  idle: "bg-muted-foreground/50",
};

function TaskCard({
  task: t,
  canEdit,
  disabled,
  onToggle,
  onDelete,
}: {
  task: BuiltinTask;
  canEdit: boolean;
  disabled: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const tone = statusTone(t);
  const name = t.anchor_name || t.room_id;
  const size = splitSize(t.file_size);
  const showTimer = tone === "recording" && t.duration && t.duration !== "-";

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border p-3.5 transition-all hover:-translate-y-px hover:shadow-md",
        tone === "recording" && "to-card border-red-200/70 bg-gradient-to-b from-red-50/50",
        tone === "error" && "to-card border-amber-200/70 bg-gradient-to-b from-amber-50/50",
        tone !== "recording" && tone !== "error" && "border-border/70 bg-card",
      )}
    >
      {/* 头像 + 状态徽章 */}
      <div className="mb-3 flex items-center justify-between">
        <div
          className={cn(
            "relative flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br text-lg font-semibold text-white shadow-sm",
            avatarGradient(name),
          )}
        >
          {avatarChar(name)}
          {t.avatar && (
            // eslint-disable-next-line @next/next/no-img-element -- 录制器转发图，尺寸不定
            <img
              src={`/api/recording/avatar?src=${encodeURIComponent(t.avatar)}`}
              alt=""
              className="absolute inset-0 size-full rounded-[14px] object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium",
            BADGE_TONE[tone],
          )}
        >
          <span className={cn("size-1.5 rounded-full", DOT_TONE[tone])} />
          {t.status}
        </span>
      </div>

      {/* 主播名 + 平台/房间 */}
      <div className="truncate text-sm font-semibold" title={name}>
        {name}
      </div>
      <div className="text-muted-foreground mt-0.5 flex items-center gap-2 truncate text-[11.5px]">
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex size-[15px] items-center justify-center rounded bg-[#161823] text-[9px] font-bold text-white">
            {platformShort(t.platform)}
          </span>
          {t.platform}
        </span>
        <span className="tabular-nums">{t.room_id}</span>
      </div>

      {/* 累计体积 + 时长 */}
      <div className="mt-3.5 flex items-end justify-between border-t pt-3">
        <div>
          <div className="text-muted-foreground mb-0.5 text-[11px]">累计体积</div>
          <div className="tabular-nums">
            <span className="text-lg font-semibold">{size.num}</span>
            {size.unit && (
              <span className="text-muted-foreground ml-0.5 text-[0.86em]">{size.unit}</span>
            )}
          </div>
        </div>
        {showTimer && (
          <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-red-600 tabular-nums">
            <Clock className="size-3.5" />
            {t.duration}
          </span>
        )}
      </div>

      {/* 操作 */}
      {canEdit && (
        <div className="mt-3 flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={disabled}
            onClick={onToggle}
          >
            {t.is_paused ? (
              <>
                <Play className="size-3.5" />
                恢复
              </>
            ) : (
              <>
                <Pause className="size-3.5" />
                暂停
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            disabled={disabled}
            aria-label="删除任务"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

function AddDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setErr(null);
    onOpenChange(false);
  }

  function submit() {
    startTransition(async () => {
      setErr(null);
      const res = await addStreamer({ url: url.trim() });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setUrl("");
      onDone();
      close();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>添加录制主播</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs">直播间链接 / 房间号</Label>
          <Input
            value={url}
            autoFocus
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && url.trim()) submit();
            }}
            placeholder="粘贴直播间链接，可加 ,主播:名字 后缀"
          />
          <p className="text-muted-foreground text-[11px]">
            平台默认按抖音识别；带 <code>,主播:名字</code> 后缀可指定录像归属的主播名。
          </p>
          {err && <p className="text-destructive text-[12px]">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={close}>
            取消
          </Button>
          <Button size="sm" disabled={pending || !url.trim()} onClick={submit}>
            添加
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfigDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [quality, setQuality] = useState("hd");
  const [segment, setSegment] = useState("0");
  const [interval, setIntervalValue] = useState("60");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setErr(null);
    onOpenChange(false);
  }

  function submit() {
    const segmentTime = Number(segment);
    const checkInterval = Number(interval);
    startTransition(async () => {
      setErr(null);
      const res = await updateRecorderConfig({
        quality,
        segment_time: Number.isFinite(segmentTime) ? segmentTime : 0,
        check_interval: Number.isFinite(checkInterval) ? checkInterval : 60,
      });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      onDone();
      close();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>录制设置</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">录制画质</Label>
            <Select value={quality} onValueChange={(v) => setQuality(v ?? "hd")}>
              <SelectTrigger className="mt-1 h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="uhd">原画</SelectItem>
                <SelectItem value="hd">高清</SelectItem>
                <SelectItem value="sd">标清</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">分段时长（分钟）</Label>
              <Input
                type="number"
                min={0}
                max={240}
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                className="mt-1"
              />
              <p className="text-muted-foreground mt-1 text-[11px]">0 = 不分段</p>
            </div>
            <div>
              <Label className="text-xs">检测间隔（秒）</Label>
              <Input
                type="number"
                min={10}
                max={600}
                value={interval}
                onChange={(e) => setIntervalValue(e.target.value)}
                className="mt-1"
              />
              <p className="text-muted-foreground mt-1 text-[11px]">开播轮询频率</p>
            </div>
          </div>
          <p className="text-muted-foreground text-[11px]">
            提交后覆盖全局录制配置，对所有任务生效（保存路径保持不变）。
          </p>
          {err && <p className="text-destructive text-[12px]">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={close}>
            取消
          </Button>
          <Button size="sm" disabled={pending} onClick={submit}>
            保存设置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
