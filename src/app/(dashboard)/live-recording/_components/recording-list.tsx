"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addCategoryAction,
  addStreamerAction,
  assignCategoryAction,
  deleteCategoryAction,
  removeStreamerAction,
  renameStreamerAction,
  setPausedAction,
  setRetentionAction,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const NO_CATEGORY = "__none__";
const FILTER_ALL = "__all__";
const FILTER_NONE = "__uncategorized__";

/** 保存时长预设(天;0 = 永久) */
const RETENTION_OPTIONS = [
  { days: 0, label: "永久" },
  { days: 3, label: "3 天" },
  { days: 7, label: "7 天" },
  { days: 15, label: "15 天" },
  { days: 30, label: "30 天" },
];

function retentionLabel(days: number): string {
  return RETENTION_OPTIONS.find((o) => o.days === days)?.label ?? `${days} 天`;
}

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
  categories,
  loadError,
}: {
  streamers: StreamerView[];
  categories: string[];
  loadError: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [addName, setAddName] = useState("");
  const [addRetention, setAddRetention] = useState(0);
  const [renameTarget, setRenameTarget] = useState<StreamerView | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<StreamerView | null>(null);

  const [filter, setFilter] = useState<string>(FILTER_ALL);
  const [manageOpen, setManageOpen] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  const recordingCount = streamers.filter((s) => s.recording).length;
  const monitoringCount = streamers.filter((s) => !s.paused && !s.recording).length;

  const shown = streamers.filter((s) => {
    if (filter === FILTER_ALL) return true;
    if (filter === FILTER_NONE) return !s.category;
    return s.category === filter;
  });

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
            setAddRetention(0);
            setAddOpen(true);
          }}
        >
          + 添加主播
        </Button>
      </div>

      {/* 分类筛选 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {[
          { key: FILTER_ALL, label: "全部" },
          ...categories.map((c) => ({ key: c, label: c })),
          { key: FILTER_NONE, label: "未分类" },
        ].map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setFilter(c.key)}
            className={`rounded-full px-3 py-1 text-[13px] font-medium transition-colors ${
              filter === c.key
                ? "bg-primary text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {c.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setManageOpen(true)}
          className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-[13px] text-slate-400 transition-colors hover:border-primary hover:text-primary"
        >
          管理分类
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="border-slate-100 hover:bg-transparent">
              <TableHead className="h-11 w-[28%] pl-5 text-xs font-medium text-slate-400">
                主播及画面
              </TableHead>
              <TableHead className="h-11 w-[9%] text-xs font-medium text-slate-400">
                直播链接
              </TableHead>
              <TableHead className="h-11 w-[21%] text-xs font-medium text-slate-400">
                录制状态
              </TableHead>
              <TableHead className="h-11 w-[12%] text-xs font-medium text-slate-400">
                分类
              </TableHead>
              <TableHead className="h-11 w-[12%] text-xs font-medium text-slate-400">
                保存时长
              </TableHead>
              <TableHead className="h-11 w-[8%] text-center text-xs font-medium text-slate-400">
                监听状态
              </TableHead>
              <TableHead className="h-11 w-[10%] pr-5 text-xs font-medium text-slate-400">
                操作
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((s) => (
              <TableRow
                key={s.index}
                className="border-slate-100 transition-colors hover:bg-slate-50/70"
              >
                <TableCell className="py-3.5 pl-5">
                  <div className="flex items-center gap-3.5">
                    <CoverThumb s={s} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[15px] font-semibold text-slate-800">
                          {s.name || s.roomId}
                        </span>
                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-px text-[10px] font-medium tracking-wide text-slate-500">
                          {s.platformName}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          s.name &&
                          router.push(`/live-recording/files?s=${encodeURIComponent(s.name)}`)
                        }
                        disabled={!s.name}
                        className="group mt-1 flex items-center gap-1 text-xs text-slate-400 tabular-nums transition-colors hover:text-primary disabled:pointer-events-none"
                      >
                        <svg
                          viewBox="0 0 16 16"
                          className="size-3.5 shrink-0 text-slate-300 transition-colors group-hover:text-primary"
                          fill="currentColor"
                        >
                          <path d="M1.75 3A1.75 1.75 0 0 0 0 4.75v6.5C0 12.216.784 13 1.75 13h12.5A1.75 1.75 0 0 0 16 11.25V5.75A1.75 1.75 0 0 0 14.25 4H8.061l-1.5-1.5A1.75 1.75 0 0 0 5.32 2H1.75A1.75 1.75 0 0 0 0 3.75V3Z" />
                        </svg>
                        <span className="group-hover:underline">
                          {s.fileCount} 个录像 · {formatSize(s.totalSize)}
                        </span>
                      </button>
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
                    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 py-1 pl-2 pr-3 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-500/15">
                      <span className="relative flex size-1.5">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                      </span>
                      正在录制
                      <span className="font-normal text-emerald-600/70 tabular-nums">
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
                <TableCell>
                  <Select
                    value={s.category || NO_CATEGORY}
                    onValueChange={(v) =>
                      run(() => assignCategoryAction(s.url, v && v !== NO_CATEGORY ? v : ""))
                    }
                    disabled={pending}
                  >
                    <SelectTrigger size="sm" className="h-7 w-full text-xs">
                      <SelectValue placeholder="未分类" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_CATEGORY}>未分类</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select
                    value={String(s.retentionDays)}
                    onValueChange={(v) =>
                      run(() => setRetentionAction(s.url, Number(v ?? "0") || 0))
                    }
                    disabled={pending}
                  >
                    <SelectTrigger
                      size="sm"
                      className={`h-7 w-full text-xs ${
                        s.retentionDays > 0 ? "text-amber-700" : ""
                      }`}
                    >
                      <SelectValue placeholder="永久" />
                    </SelectTrigger>
                    <SelectContent>
                      {RETENTION_OPTIONS.map((o) => (
                        <SelectItem key={o.days} value={String(o.days)}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
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
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-slate-600">录像保存时长</span>
                <Select
                  value={String(addRetention)}
                  onValueChange={(v) => setAddRetention(Number(v ?? "0") || 0)}
                >
                  <SelectTrigger size="sm" className="h-8 w-28 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RETENTION_OPTIONS.map((o) => (
                      <SelectItem key={o.days} value={String(o.days)}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-slate-400">
                {addRetention > 0
                  ? `录像超过 ${retentionLabel(addRetention)}会被自动删除,释放硬盘空间`
                  : "永久保存,不会自动删除(可随时在名单里改)"}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={pending || !addUrl.trim()}
              onClick={() =>
                run(
                  () => addStreamerAction(addUrl.trim(), addName.trim(), addRetention),
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

      {/* 管理分类 */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>管理分类</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="新分类名(如 官号直播、棋牌)"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newCategory.trim()) {
                    run(
                      () => addCategoryAction(newCategory.trim()),
                      () => setNewCategory(""),
                    );
                  }
                }}
              />
              <Button
                disabled={pending || !newCategory.trim()}
                onClick={() =>
                  run(
                    () => addCategoryAction(newCategory.trim()),
                    () => setNewCategory(""),
                  )
                }
              >
                新建
              </Button>
            </div>
            <div className="space-y-1">
              {categories.length === 0 && (
                <div className="py-6 text-center text-sm text-slate-400">
                  还没有分类,在上面新建一个
                </div>
              )}
              {categories.map((c) => (
                <div
                  key={c}
                  className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm"
                >
                  <span className="text-slate-700">{c}</span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => deleteCategoryAction(c))}
                    className="text-xs text-slate-400 transition-colors hover:text-red-600 disabled:opacity-40"
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400">
              删除分类会把归属该分类的主播恢复为「未分类」,不影响录制与录像。
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
