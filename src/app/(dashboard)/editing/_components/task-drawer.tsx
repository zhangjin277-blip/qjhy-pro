"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { loadTaskDetail } from "../actions";
import {
  resetEditing,
  reviewApprove,
  deleteCover,
  recordReviewWatch,
} from "@/modules/editing-task";
import type { EditorOption } from "@/modules/editing-editor";
import type { TaskDetail, TaskEvent } from "@/modules/editing-task";
import { ReviewRejectDialog } from "./review-reject-dialog";
import { MarkPublishedDialog } from "./mark-published-dialog";
import { MarkDisqualifiedDialog } from "./mark-disqualified-dialog";
import { AssignPopover } from "./assign-popover";
import { ChangePriorityDialog } from "./change-priority-dialog";
import { toast } from "sonner";
import { toggleDisqualified } from "@/modules/editing-task";
import { VideoPreviewModal } from "./video-preview-modal";

interface Props {
  taskId: number;
  onClose: () => void;
  editors: EditorOption[];
  permissions: { canEdit: boolean; isAdmin: boolean };
}

export function TaskDrawer({ taskId, onClose, editors, permissions }: Props) {
  const [data, setData] = useState<{ task: TaskDetail | null; events: TaskEvent[] } | null>(null);
  const [preview, setPreview] = useState<{
    src: string;
    fileName: string;
    kind: "source" | "edited";
  } | null>(null);
  // 本次抽屉打开期间累计的成品观看秒数（preview 关闭时即时 flush 到 DB）
  const [editedWatchSec, setEditedWatchSec] = useState(0);

  useEffect(() => {
    loadTaskDetail(taskId).then(setData);
  }, [taskId]);

  async function flushWatch() {
    if (editedWatchSec <= 0) return;
    if (!data?.task || data.task.status !== "review") {
      setEditedWatchSec(0);
      return;
    }
    try {
      await recordReviewWatch({ taskId, seconds: editedWatchSec });
      const fresh = await loadTaskDetail(taskId);
      setData(fresh);
    } catch {
      // 静默忽略，不打断用户操作
    }
    setEditedWatchSec(0);
  }

  if (!data) return null;
  if (!data.task) {
    return (
      <div
        className="fixed inset-0 z-40 flex items-center justify-center bg-black/30"
        onClick={onClose}
      >
        <div className="rounded-lg bg-white p-6">任务不存在</div>
      </div>
    );
  }
  const { task, events } = data;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-screen w-[520px] flex-col border-l border-border bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{task.liveAccountName}</h2>
            <StatusChip status={task.status} />
            {task.isDisqualified && (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-600">
                ❌ 不合格
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-2xl leading-none text-slate-400 hover:text-slate-700"
          >
            ×
          </button>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-4">
          <section className="mb-6 space-y-2 text-sm">
            <Row label="素材日期">{task.materialDate}</Row>
            <Row label="主播">{task.anchorName ?? "—"}</Row>
            <Row label="产品">{task.product}</Row>
            <Row label="创建人">{task.createdByName}</Row>
            <Row label="剪辑要求">{task.sourceRemark ?? "—"}</Row>
            <Row label="优先级">
              {task.priority === "urgent" ? (
                <>
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-600">
                    🔴 紧急
                  </span>
                  {task.urgentReason && (
                    <span className="ml-2 text-xs text-slate-400">· {task.urgentReason}</span>
                  )}
                </>
              ) : (
                <span className="text-slate-500">正常</span>
              )}
            </Row>
            {task.duplicateOf && (
              <Row label="重复关联">
                <a href={`?task=${task.duplicateOf}`} className="text-blue-600 hover:underline">
                  task #{task.duplicateOf}
                </a>
              </Row>
            )}
          </section>

          {task.isDisqualified && (
            <section className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
              <div className="mb-1 font-semibold text-red-700">不合格素材</div>
              {task.disqualifiedReason && (
                <div className="mb-1 text-red-600">原因：{task.disqualifiedReason}</div>
              )}
              <div className="text-xs text-red-400">
                标记人：{task.disqualifiedByName ?? "—"}
                {task.disqualifiedAt && (
                  <> · {new Date(task.disqualifiedAt).toLocaleString("zh-CN")}</>
                )}
              </div>
            </section>
          )}

          <section className="mb-6">
            <SectionTitle>素材文件</SectionTitle>
            {task.sourceFiles.length === 0 ? (
              <p className="text-sm text-slate-400">无</p>
            ) : (
              <FileList
                files={task.sourceFiles}
                names={task.sourceFileNames}
                taskId={task.id}
                kind="source"
                onPreview={(src, fileName) => setPreview({ src, fileName, kind: "source" })}
              />
            )}
          </section>

          {task.editedFiles.length > 0 && (
            <section className="mb-6">
              <SectionTitle>成品文件</SectionTitle>
              <FileList
                files={task.editedFiles}
                names={task.editedFileNames}
                taskId={task.id}
                kind="edited"
                onPreview={(src, fileName) => setPreview({ src, fileName, kind: "edited" })}
              />
              {task.status === "review" && (
                <p className="mt-2 text-xs text-slate-400">
                  本次审核成品累计观看
                  <b className="ml-1 text-slate-700">{editedWatchSec}</b>
                  <span className="ml-0.5">秒</span>
                  {task.reviewWatchSeconds > 0 && (
                    <span className="ml-2 text-slate-300">
                      · 历史累计 {task.reviewWatchSeconds} 秒
                    </span>
                  )}
                </p>
              )}
              {task.status !== "review" && task.reviewWatchSeconds > 0 && (
                <p className="mt-2 text-xs text-slate-400">
                  审核成品累计观看
                  <b className="ml-1 text-slate-700">{task.reviewWatchSeconds}</b>
                  <span className="ml-0.5">秒</span>
                </p>
              )}
            </section>
          )}

          {(task.editedFiles.length > 0 || task.coverImage) && (
            <section className="mb-6">
              <SectionTitle>封面图</SectionTitle>
              {task.coverImage ? (
                <div className="flex items-start gap-3">
                  <Image
                    src={`/api/editing/download?taskId=${task.id}&kind=cover`}
                    alt="封面"
                    width={0}
                    height={128}
                    unoptimized
                    className="h-32 w-auto rounded border border-border object-cover"
                  />
                  <div className="flex flex-col gap-2 text-sm">
                    <a
                      href={`/api/editing/download?taskId=${task.id}&kind=cover`}
                      download
                      className="text-blue-600 hover:underline"
                    >
                      下载
                    </a>
                    <button
                      onClick={async () => {
                        if (!confirm("删除封面图？")) return;
                        try {
                          await deleteCover({ taskId: task.id });
                          toast.success("已删除");
                          location.reload();
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "删除失败");
                        }
                      }}
                      className="text-left text-red-500 hover:underline"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ) : task.status === "editing" ? (
                <UploadCoverButton taskId={task.id} />
              ) : (
                <span className="text-sm text-slate-400">无</span>
              )}
            </section>
          )}

          {task.publishedAt && (
            <section className="mb-6 space-y-2 text-sm">
              <SectionTitle>发布信息</SectionTitle>
              <Row label="发布人">{task.publishedByName ?? "—"}</Row>
              <Row label="发布时间">{new Date(task.publishedAt).toLocaleString("zh-CN")}</Row>
              <Row label="抖音视频">
                {task.videoId ? (
                  <a
                    href={`https://www.douyin.com/video/${task.videoId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {task.videoId}
                  </a>
                ) : (
                  <span className="text-slate-400">未绑定</span>
                )}
              </Row>
            </section>
          )}

          <section className="mb-6">
            <SectionTitle>操作历史</SectionTitle>
            <Timeline events={events} editors={editors} />
          </section>
        </main>

        <footer className="flex flex-wrap gap-2 border-t border-border bg-white px-6 py-3">
          {task.status === "uploaded" && permissions.canEdit && (
            <AssignPopover editors={editors} taskIds={[task.id]} onDone={onClose} />
          )}
          {task.status === "editing" && (
            <>
              <button
                onClick={async () => {
                  try {
                    await resetEditing({ taskId: task.id });
                    toast.success("已回退到待剪辑");
                    onClose();
                    location.reload();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "回退失败");
                  }
                }}
                className="rounded border border-border px-3 py-1.5 text-sm hover:border-amber-500 hover:text-amber-600"
              >
                回退到待剪辑
              </button>
              <UploadEditedButton taskId={task.id} />
            </>
          )}
          {task.status === "review" && (
            <>
              <button
                onClick={async () => {
                  if (!confirm("审核通过？")) return;
                  try {
                    await flushWatch();
                    await reviewApprove({ taskId: task.id });
                    toast.success("审核通过");
                    onClose();
                    location.reload();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "操作失败");
                  }
                }}
                className="rounded bg-blue-500 px-3 py-1.5 text-sm text-white hover:bg-blue-600"
              >
                审核通过
              </button>
              <ReviewRejectDialog taskId={task.id} onBeforeReject={flushWatch} onDone={onClose} />
            </>
          )}
          {task.status === "ready" && (
            <MarkPublishedDialog taskId={task.id} isAdmin={permissions.isAdmin} onDone={onClose} />
          )}
          {task.isDisqualified ? (
            <button
              onClick={async () => {
                if (!confirm("取消不合格标记？")) return;
                try {
                  await toggleDisqualified({ taskId: task.id, disqualified: false });
                  toast.success("已取消标记");
                  onClose();
                  location.reload();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "操作失败");
                }
              }}
              className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              取消不合格标记
            </button>
          ) : (
            <MarkDisqualifiedDialog taskId={task.id} onDone={onClose} />
          )}
          {task.status !== "published" && (
            <ChangePriorityDialog taskId={task.id} currentPriority={task.priority} />
          )}
        </footer>
      </div>
      {preview && (
        <VideoPreviewModal
          src={preview.src}
          fileName={preview.fileName}
          onClose={async () => {
            await flushWatch();
            setPreview(null);
          }}
          onWatched={
            preview.kind === "edited" && task.status === "review"
              ? (sec) => setEditedWatchSec((s) => s + sec)
              : undefined
          }
        />
      )}
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="w-20 text-slate-400">{label}</span>
      <span className="flex-1">{children}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
      {children}
    </h3>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    uploaded: { label: "待剪辑", cls: "bg-blue-50 text-blue-600" },
    editing: { label: "剪辑中", cls: "bg-amber-50 text-amber-600" },
    review: { label: "审核", cls: "bg-purple-50 text-purple-600" },
    ready: { label: "待发布", cls: "bg-cyan-50 text-cyan-600" },
    published: { label: "已发布", cls: "bg-green-50 text-green-600" },
  };
  const m = map[status] ?? { label: status, cls: "bg-slate-100 text-slate-600" };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${m.cls}`}>{m.label}</span>
  );
}

function Timeline({ events, editors }: { events: TaskEvent[]; editors: EditorOption[] }) {
  if (events.length === 0) return <p className="text-sm text-slate-400">暂无操作记录</p>;
  const nameMap = new Map(editors.map((e) => [e.userId, e.name]));
  return (
    <ol className="space-y-3 border-l border-border pl-4">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-blue-500" />
          <div className="text-sm">
            <span className="font-medium">{e.actorName}</span>{" "}
            <span className="text-slate-500">{formatEvent(e, nameMap)}</span>
          </div>
          <div className="text-xs text-slate-400">
            {new Date(e.createdAt).toLocaleString("zh-CN")}
          </div>
        </li>
      ))}
    </ol>
  );
}

function formatEvent(e: TaskEvent, nameMap: Map<string, string>): string {
  const p = e.payload as Record<string, unknown>;
  const nameOf = (v: unknown) => {
    if (typeof v !== "string") return String(v ?? "?");
    return nameMap.get(v) ?? v;
  };
  switch (e.eventType) {
    case "created":
      return "创建任务";
    case "source_uploaded":
      return `上传 ${p.file_count ?? 1} 个素材`;
    case "assigned":
      return `派单给 ${typeof p.to_name === "string" ? p.to_name : nameOf(p.to)}`;
    case "reassigned":
      return `改派给 ${typeof p.to_name === "string" ? p.to_name : nameOf(p.to)}`;
    case "editing_reset":
      return "回退到待剪辑";
    case "edited_uploaded":
      return "上传成品";
    case "cover_uploaded":
      return "上传封面图";
    case "cover_deleted":
      return "删除封面图";
    case "review_approved":
      return "审核通过";
    case "review_rejected":
      return `审核回退：${p.reason ?? ""}`;
    case "published":
      if (p.auto_matched) return `发布并自动绑定视频 ${p.video_id ?? ""}`;
      if (p.video_id) return `发布（手填视频 ${p.video_id}）`;
      return "发布（未绑定视频）";
    case "deleted":
      return "删除任务";
    case "disqualified":
      return `标记不合格${p.reason ? `：${p.reason}` : ""}`;
    case "disqualified_undone":
      return "取消不合格标记";
    case "priority_changed":
      return `优先级 ${p.from === "urgent" ? "🔴 紧急" : "正常"} → ${p.to === "urgent" ? "🔴 紧急" : "正常"}${p.urgent_reason ? `：${p.urgent_reason}` : ""}`;
    case "duplicate_detected":
      return `检测到重复素材（同 MD5 已在 task #${p.duplicate_of}）`;
    default:
      return e.eventType;
  }
}

function FileList({
  files,
  names,
  taskId,
  kind,
  onPreview,
}: {
  files: string[];
  names: string[];
  taskId: number;
  kind: "source" | "edited";
  onPreview: (src: string, fileName: string) => void;
}) {
  return (
    <ul className="space-y-1 text-sm">
      {files.map((p, i) => {
        const fileName = names[i] ?? p;
        const isVideo = /\.(mp4|mov|webm|m4v)$/i.test(fileName);
        return (
          <li
            key={p}
            className="flex items-center justify-between rounded px-2 py-1 hover:bg-slate-50"
          >
            <span className="flex-1 truncate">{fileName}</span>
            <div className="flex items-center gap-3">
              {isVideo && (
                <button
                  onClick={() =>
                    onPreview(
                      `/api/editing/download?taskId=${taskId}&kind=${kind}&index=${i}&inline=1`,
                      fileName,
                    )
                  }
                  className="text-blue-600 hover:underline"
                >
                  预览
                </button>
              )}
              <a
                href={`/api/editing/download?taskId=${taskId}&kind=${kind}&index=${i}`}
                className="text-blue-600 hover:underline"
                download
              >
                下载
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function UploadCoverButton({ taskId }: { taskId: number }) {
  return (
    <label className="cursor-pointer rounded border border-blue-500 bg-white px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50">
      上传封面图
      <input
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const fd = new FormData();
          fd.append("taskId", String(taskId));
          fd.append("file", file);
          try {
            const r = await fetch("/api/editing/upload-cover", { method: "POST", body: fd });
            if (!r.ok) {
              const j = await r.json().catch(() => ({}));
              throw new Error((j as { error?: string }).error ?? "上传失败");
            }
            toast.success("封面图已上传");
            location.reload();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "上传失败");
          }
        }}
      />
    </label>
  );
}

function UploadEditedButton({ taskId }: { taskId: number }) {
  const [open, setOpen] = useState(false);
  const [videos, setVideos] = useState<File[]>([]);
  const [cover, setCover] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function submit() {
    if (videos.length === 0) {
      toast.error("请选择至少 1 个成品视频");
      return;
    }
    setUploading(true);
    const total = videos.length + (cover ? 1 : 0);
    setProgress({ done: 0, total });
    let done = 0;
    let succeeded = 0;
    let failed = 0;

    // 视频们
    for (const file of videos) {
      const fd = new FormData();
      fd.append("taskId", String(taskId));
      fd.append("file", file);
      try {
        const res = await fetch("/api/editing/upload-edited", { method: "POST", body: fd });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error((j as { error?: string }).error ?? "上传失败");
        }
        succeeded++;
      } catch (err) {
        failed++;
        toast.error(`${file.name}: ${err instanceof Error ? err.message : "上传失败"}`);
      }
      done++;
      setProgress({ done, total });
    }

    // 封面图
    if (cover) {
      const fd = new FormData();
      fd.append("taskId", String(taskId));
      fd.append("file", cover);
      try {
        const res = await fetch("/api/editing/upload-cover", { method: "POST", body: fd });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error((j as { error?: string }).error ?? "封面上传失败");
        }
        succeeded++;
      } catch (err) {
        failed++;
        toast.error(`封面图：${err instanceof Error ? err.message : "上传失败"}`);
      }
      done++;
      setProgress({ done, total });
    }

    setUploading(false);
    if (succeeded > 0) {
      toast.success(`成功 ${succeeded}${failed > 0 ? ` · 失败 ${failed}` : ""}`);
      location.reload();
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded border border-blue-500 bg-white px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50"
      >
        上传成品
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/40"
            onClick={() => !uploading && setOpen(false)}
          />
          <div className="fixed left-1/2 top-1/2 z-[70] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-2xl">
            <header className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">上传成品</h2>
              <button
                disabled={uploading}
                onClick={() => setOpen(false)}
                className="text-2xl leading-none text-slate-400 hover:text-slate-700 disabled:opacity-30"
              >
                ×
              </button>
            </header>
            <div className="space-y-5">
              <div>
                <div className="mb-1.5 text-sm font-semibold">
                  成品视频 <span className="text-red-500">*</span>
                </div>
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/50 py-6 transition hover:border-blue-400 hover:bg-blue-50/30">
                  <input
                    type="file"
                    accept="video/*"
                    multiple
                    hidden
                    onChange={(e) => setVideos(Array.from(e.target.files ?? []))}
                  />
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-slate-400"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span className="text-sm text-slate-500">点击选择成品视频（可多选）</span>
                  {videos.length > 0 && (
                    <span className="text-xs text-blue-600">已选 {videos.length} 个文件</span>
                  )}
                </label>
              </div>
              <div>
                <div className="mb-1.5 text-sm font-semibold">
                  封面图{" "}
                  <span className="ml-1 text-xs font-normal text-slate-400">
                    （选填，单张，≤ 20MB）
                  </span>
                </div>
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/50 py-6 transition hover:border-blue-400 hover:bg-blue-50/30">
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => setCover(e.target.files?.[0] ?? null)}
                  />
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-slate-400"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span className="text-sm text-slate-500">点击选择封面图（jpg / png / webp）</span>
                  {cover && (
                    <span className="text-xs text-blue-600">
                      {cover.name} · {Math.round(cover.size / 1024)} KB
                    </span>
                  )}
                </label>
              </div>
            </div>
            <footer className="mt-6 flex justify-end gap-2 border-t pt-4">
              <button
                disabled={uploading}
                onClick={() => setOpen(false)}
                className="rounded border px-4 py-2 text-sm disabled:opacity-50"
              >
                取消
              </button>
              <button
                disabled={uploading || videos.length === 0}
                onClick={submit}
                className="rounded bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600 disabled:opacity-50"
              >
                {uploading && progress
                  ? `上传 ${progress.done}/${progress.total} ...`
                  : uploading
                    ? "上传中..."
                    : "确认上传"}
              </button>
            </footer>
          </div>
        </>
      )}
    </>
  );
}
