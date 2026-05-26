"use client";
import { useEffect, useState } from "react";
import { loadTaskDetail } from "../actions";
import { resetEditing, reviewApprove } from "@/modules/editing-task";
import type { EditorOption } from "@/modules/editing-editor";
import type { TaskDetail, TaskEvent } from "@/modules/editing-task";
import { ReviewRejectDialog } from "./review-reject-dialog";
import { MarkPublishedDialog } from "./mark-published-dialog";
import { AssignPopover } from "./assign-popover";
import { toast } from "sonner";

interface Props {
  taskId: number;
  onClose: () => void;
  editors: EditorOption[];
  permissions: { canEdit: boolean; isAdmin: boolean };
}

export function TaskDrawer({ taskId, onClose, editors, permissions }: Props) {
  const [data, setData] = useState<{ task: TaskDetail | null; events: TaskEvent[] } | null>(null);

  useEffect(() => {
    loadTaskDetail(taskId).then(setData);
  }, [taskId]);

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
      <div className="fixed right-0 top-0 z-50 h-screen w-[520px] overflow-y-auto border-l border-border bg-white p-6 shadow-2xl">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">{task.liveAccountName}</h2>
            <StatusChip status={task.status} />
          </div>
          <button
            onClick={onClose}
            className="text-2xl leading-none text-slate-400 hover:text-slate-700"
          >
            ×
          </button>
        </header>

        <section className="mb-6 space-y-2 text-sm">
          <Row label="素材日期">{task.materialDate}</Row>
          <Row label="主播">{task.anchorName ?? "—"}</Row>
          <Row label="产品">{task.product}</Row>
          <Row label="创建人">{task.createdByName}</Row>
          <Row label="剪辑要求">{task.sourceRemark ?? "—"}</Row>
        </section>

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
            />
          </section>
        )}

        {task.status === "published" && (
          <section className="mb-6 text-sm">
            <SectionTitle>抖音视频</SectionTitle>
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
              <span className="text-slate-400">未绑定（admin 跳过）</span>
            )}
          </section>
        )}

        <section className="mb-6">
          <SectionTitle>操作历史</SectionTitle>
          <Timeline events={events} />
        </section>

        <footer className="flex flex-wrap gap-2 border-t border-border pt-4">
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
          {task.status === "review" && permissions.canEdit && (
            <>
              <button
                onClick={async () => {
                  if (!confirm("审核通过？")) return;
                  try {
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
              <ReviewRejectDialog taskId={task.id} onDone={onClose} />
            </>
          )}
          {task.status === "ready" && permissions.canEdit && (
            <MarkPublishedDialog taskId={task.id} isAdmin={permissions.isAdmin} onDone={onClose} />
          )}
        </footer>
      </div>
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

function Timeline({ events }: { events: TaskEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-slate-400">暂无操作记录</p>;
  return (
    <ol className="space-y-3 border-l border-border pl-4">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-blue-500" />
          <div className="text-sm">
            <span className="font-medium">{e.actorName}</span>{" "}
            <span className="text-slate-500">{formatEvent(e)}</span>
          </div>
          <div className="text-xs text-slate-400">
            {new Date(e.createdAt).toLocaleString("zh-CN")}
          </div>
        </li>
      ))}
    </ol>
  );
}

function formatEvent(e: TaskEvent): string {
  const p = e.payload as Record<string, unknown>;
  switch (e.eventType) {
    case "created":
      return "创建任务";
    case "source_uploaded":
      return `上传 ${p.file_count ?? 1} 个素材`;
    case "assigned":
      return `派单给 ${p.to ?? "?"}`;
    case "reassigned":
      return `改派给 ${p.to ?? "?"}`;
    case "editing_reset":
      return "回退到待剪辑";
    case "edited_uploaded":
      return "上传成品";
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
    default:
      return e.eventType;
  }
}

function FileList({
  files,
  names,
  taskId,
  kind,
}: {
  files: string[];
  names: string[];
  taskId: number;
  kind: "source" | "edited";
}) {
  return (
    <ul className="space-y-1 text-sm">
      {files.map((p, i) => (
        <li
          key={p}
          className="flex items-center justify-between rounded px-2 py-1 hover:bg-slate-50"
        >
          <span className="truncate">{names[i] ?? p}</span>
          <a
            href={`/api/editing/download?taskId=${taskId}&kind=${kind}&index=${i}`}
            className="text-blue-600 hover:underline"
            download
          >
            下载
          </a>
        </li>
      ))}
    </ul>
  );
}

function UploadEditedButton({ taskId }: { taskId: number }) {
  return (
    <label className="cursor-pointer rounded border border-blue-500 bg-white px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50">
      上传成品
      <input
        type="file"
        accept="video/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const fd = new FormData();
          fd.append("taskId", String(taskId));
          fd.append("file", file);
          try {
            const res = await fetch("/api/editing/upload-edited", { method: "POST", body: fd });
            if (!res.ok) throw new Error("上传失败");
            toast.success("成品已上传");
            location.reload();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "上传失败");
          }
        }}
      />
    </label>
  );
}
