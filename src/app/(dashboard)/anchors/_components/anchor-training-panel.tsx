"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  assignAnchorCourse,
  autoAssignAnchorTraining,
  deleteAnchorTraining,
  deleteTrainingTemplate,
  getAnchorTraining,
  saveTrainingTemplate,
  updateAnchorTraining,
} from "@/modules/course-center";
import type { TrainingTask, TrainingTemplate } from "@/modules/course-center";

type Payload = Awaited<ReturnType<typeof getAnchorTraining>>;

export function AnchorTrainingPanel({ anchorId }: { anchorId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [courseId, setCourseId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [required, setRequired] = useState(true);
  const [templateId, setTemplateId] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TrainingTemplate | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(() => {
      getAnchorTraining(anchorId)
        .then((value) => {
          setData(value);
          setError(null);
        })
        .catch((cause) => setError(cause instanceof Error ? cause.message : "培训数据加载失败"));
    });
  }, [anchorId]);
  useEffect(load, [load]);

  function run(task: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      try {
        await task();
        toast.success(success);
        load();
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : "操作失败");
      }
    });
  }
  if (error)
    return (
      <section className="rounded-md border p-4 text-sm text-destructive">
        培训数据加载失败：{error}
      </section>
    );
  if (!data)
    return (
      <section className="rounded-md border p-4 text-sm text-muted-foreground">
        培训数据加载中...
      </section>
    );

  const requiredTasks = data.tasks.filter((x) => x.isRequired);
  const requiredDone = requiredTasks.filter((x) => x.status === "completed").length;
  return (
    <section className="mb-4 rounded-lg border bg-card p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="block h-3 w-[3px] rounded bg-primary" />
        <span className="text-xs font-medium text-foreground/80">培训进度</span>
        <span className="text-xs text-muted-foreground">
          必修 {requiredDone}/{requiredTasks.length}
        </span>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" disabled={pending} onClick={load}>
          <RefreshCw className="mr-1 size-3" />
          刷新
        </Button>
      </div>
      {data.canManage && (
        <div className="mb-4 grid gap-2 rounded-md bg-muted/40 p-3 lg:grid-cols-[1fr_110px_150px_auto]">
          <select
            aria-label="选择课程"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            <option value="">选择课程</option>
            {data.courses
              .filter((course) => !data.tasks.some((task) => task.courseId === course.id))
              .map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
          </select>
          <label className="flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
            />
            {required ? "必修" : "选修"}
          </label>
          <Input
            type="date"
            aria-label="截止日期"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
          <Button
            disabled={!courseId || pending}
            onClick={() =>
              run(
                () =>
                  assignAnchorCourse({
                    anchorId,
                    courseId,
                    isRequired: required,
                    deadline: deadline || null,
                  }),
                "课程已分配",
              )
            }
          >
            <Plus className="mr-1 size-4" />
            添加课程
          </Button>
          <select
            aria-label="培训模板"
            className="h-9 rounded-md border bg-background px-3 text-sm lg:col-span-2"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">按项目或新手课程自动分配</option>
            {data.templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
                {template.project ? ` · ${template.project}` : ""}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  autoAssignAnchorTraining(anchorId, templateId ? Number(templateId) : undefined),
                "自动分配完成",
              )
            }
          >
            自动分配
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setEditingTemplate(null);
              setTemplateOpen(true);
            }}
          >
            管理模板
          </Button>
        </div>
      )}
      <div className="divide-y border-y">
        {data.tasks.map((task) => (
          <TrainingRow
            key={task.id}
            task={task}
            canManage={data.canManage}
            pending={pending}
            onSave={(next) => run(() => updateAnchorTraining(next), "培训任务已更新")}
            onDelete={() => run(() => deleteAnchorTraining(task.id), "培训任务已删除")}
          />
        ))}
        {!data.tasks.length && (
          <p className="py-8 text-center text-sm text-muted-foreground">暂无培训任务</p>
        )}
      </div>
      {templateOpen && (
        <TemplateManager
          templates={data.templates}
          courses={data.courses}
          editing={editingTemplate}
          onEdit={setEditingTemplate}
          onClose={() => setTemplateOpen(false)}
          onSaved={() => {
            setEditingTemplate(null);
            load();
          }}
        />
      )}
    </section>
  );
}

function TrainingRow({
  task,
  canManage,
  pending,
  onSave,
  onDelete,
}: {
  task: TrainingTask;
  canManage: boolean;
  pending: boolean;
  onSave: (task: {
    id: number;
    status: TrainingTask["status"];
    score: number | null;
    remark: string | null;
    isRequired: boolean;
    deadline: string | null;
  }) => void;
  onDelete: () => void;
}) {
  const [status, setStatus] = useState(task.status);
  const [score, setScore] = useState(task.score == null ? "" : String(task.score));
  const [remark, setRemark] = useState(task.remark ?? "");
  const [isRequired, setIsRequired] = useState(task.isRequired);
  const [deadline, setDeadline] = useState(task.deadline ?? "");
  return (
    <div className="grid items-center gap-2 py-3 text-sm lg:grid-cols-[minmax(180px,1fr)_100px_140px_90px_auto]">
      <div>
        <p className="font-medium">{task.courseTitle}</p>
        <p className="text-xs text-muted-foreground">
          {task.isRequired ? "必修" : "选修"}
          {task.deadline ? ` · 截止 ${task.deadline}` : ""}
        </p>
      </div>
      {canManage ? (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isRequired}
            onChange={(e) => setIsRequired(e.target.checked)}
          />
          {isRequired ? "必修" : "选修"}
        </label>
      ) : (
        <span>{task.isRequired ? "必修" : "选修"}</span>
      )}
      {canManage ? (
        <select
          aria-label="培训状态"
          className="h-8 rounded-md border bg-background px-2"
          value={status}
          onChange={(e) => setStatus(e.target.value as TrainingTask["status"])}
        >
          <option value="not_started">未开始</option>
          <option value="in_progress">学习中</option>
          <option value="completed">已完成</option>
          <option value="failed">未通过</option>
        </select>
      ) : (
        <span>
          {status === "completed"
            ? "已完成"
            : status === "failed"
              ? "未通过"
              : status === "in_progress"
                ? "学习中"
                : "未开始"}
        </span>
      )}
      {canManage ? (
        <Input
          className="h-8"
          type="number"
          placeholder="成绩"
          value={score}
          onChange={(e) => setScore(e.target.value)}
        />
      ) : (
        <span>{task.score ?? "-"} 分</span>
      )}
      {canManage && (
        <div className="flex gap-1">
          <Input
            className="h-8 w-36"
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
          <Button
            size="icon"
            variant="ghost"
            title="保存培训任务"
            disabled={pending}
            onClick={() =>
              onSave({
                id: task.id,
                status,
                score: score === "" ? null : Number(score),
                remark: remark || null,
                isRequired,
                deadline: deadline || null,
              })
            }
          >
            <Save className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title="删除培训任务"
            disabled={pending}
            onClick={onDelete}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      )}
      {canManage ? (
        <Input
          className="h-8 lg:col-span-full"
          placeholder="培训备注"
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
        />
      ) : task.remark ? (
        <p className="text-xs text-muted-foreground lg:col-span-full">备注：{task.remark}</p>
      ) : null}
    </div>
  );
}

function TemplateManager({
  templates,
  courses,
  editing,
  onEdit,
  onClose,
  onSaved,
}: {
  templates: TrainingTemplate[];
  courses: { id: string; title: string; stage: string }[];
  editing: TrainingTemplate | null;
  onEdit: (value: TrainingTemplate | null) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [project, setProject] = useState(editing?.project ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [courseIds, setCourseIds] = useState<string[]>(editing?.courseIds ?? []);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    setName(editing?.name ?? "");
    setProject(editing?.project ?? "");
    setDescription(editing?.description ?? "");
    setCourseIds(editing?.courseIds ?? []);
  }, [editing]);
  const save = () =>
    startTransition(async () => {
      try {
        await saveTrainingTemplate({
          id: editing?.id,
          name,
          project: project || null,
          description: description || null,
          courseIds,
        });
        toast.success("培训模板已保存");
        onSaved();
        setName("");
        setProject("");
        setDescription("");
        setCourseIds([]);
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : "保存失败");
      }
    });
  const remove = () => {
    if (!editing) return;
    const id = editing.id;
    startTransition(async () => {
      try {
        await deleteTrainingTemplate(id);
        toast.success("模板已删除");
        onSaved();
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : "删除失败");
      }
    });
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-md bg-background p-5 shadow-xl">
        <div className="mb-4 flex items-center">
          <h3 className="font-semibold">培训模板管理</h3>
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </div>
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <div className="divide-y border-y">
            {templates.map((template) => (
              <button
                key={template.id}
                className="block w-full px-2 py-3 text-left hover:bg-muted"
                onClick={() => onEdit(template)}
              >
                <p className="text-sm font-medium">{template.name}</p>
                <p className="text-xs text-muted-foreground">
                  {template.project || "通用"} · {template.courseIds.length} 门课
                </p>
              </button>
            ))}
            {!templates.length && (
              <p className="py-8 text-center text-sm text-muted-foreground">暂无模板</p>
            )}
          </div>
          <div className="space-y-3">
            <Input placeholder="模板名称" value={name} onChange={(e) => setName(e.target.value)} />
            <Input
              placeholder="适用项目，例如：三国项目"
              value={project}
              onChange={(e) => setProject(e.target.value)}
            />
            <Input
              placeholder="模板说明"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="max-h-64 space-y-1 overflow-y-auto border p-2">
              {courses.map((course) => (
                <label key={course.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={courseIds.includes(course.id)}
                    onChange={(e) =>
                      setCourseIds(
                        e.target.checked
                          ? [...courseIds, course.id]
                          : courseIds.filter((id) => id !== course.id),
                      )
                    }
                  />
                  {course.title}
                </label>
              ))}
            </div>
            <div className="flex justify-between">
              <div>
                {editing && (
                  <Button variant="destructive" disabled={pending} onClick={remove}>
                    <Trash2 className="mr-1 size-4" />
                    删除模板
                  </Button>
                )}
              </div>
              <Button disabled={pending || !name.trim()} onClick={save}>
                <Save className="mr-1 size-4" />
                保存模板
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
