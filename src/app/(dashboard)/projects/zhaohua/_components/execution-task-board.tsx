"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  Filter,
  Pencil,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useProjectSharedState } from "@/hooks/use-project-shared-state";
import { cn } from "@/lib/utils/cn";

export type TaskScope = "项目管理" | "生态主播" | "官号直播" | "团队协作";
export type TaskStatus = "未开始" | "进行中" | "待确认" | "已阻塞" | "已完成";
export type TaskPriority = "高" | "中" | "低";

export interface ExecutionTask {
  id: string;
  title: string;
  scope: TaskScope;
  owner: string;
  followers: string;
  startDate: string;
  dueDate: string;
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  latestUpdate: string;
  nextAction: string;
  updatedAt: string;
}

export const EXECUTION_TASK_STORAGE_KEY = "zhaohua-execution-tasks-v1";
const SCOPES: TaskScope[] = ["项目管理", "生态主播", "官号直播", "团队协作"];
const scopeLabel = (scope: TaskScope | "全部") => (scope === "生态主播" ? "线下主播" : scope);
const STATUSES: TaskStatus[] = ["未开始", "进行中", "待确认", "已阻塞", "已完成"];
const PRIORITIES: TaskPriority[] = ["高", "中", "低"];

export const INITIAL_EXECUTION_TASKS: ExecutionTask[] = [
  {
    id: "roster-confirmation",
    title: "人员与职责盘点",
    scope: "项目管理",
    owner: "长沙团队",
    followers: "黄建良",
    startDate: "",
    dueDate: "",
    status: "已完成",
    priority: "高",
    progress: 100,
    latestUpdate: "长沙执行团队、恒星协作角色和主播归属已完成首轮确认",
    nextAction: "人员变化时持续更新",
    updatedAt: "初始记录",
  },
  {
    id: "ecology-operation",
    title: "线下主播持续运营",
    scope: "生态主播",
    owner: "丁友发",
    followers: "赵湘泉、姜博涛、杨宁",
    startDate: "",
    dueDate: "",
    status: "进行中",
    priority: "高",
    progress: 45,
    latestUpdate: "线下主播与线上机构均已进入日常经营",
    nextAction: "持续跟进主播开播、培训和经营表现",
    updatedAt: "初始记录",
  },
  {
    id: "official-live-operation",
    title: "抖音官号直播",
    scope: "官号直播",
    owner: "肖杰阳",
    followers: "官号运营、场控与主播组",
    startDate: "",
    dueDate: "",
    status: "进行中",
    priority: "高",
    progress: 50,
    latestUpdate: "官号已开播，班组按轮播排班执行",
    nextAction: "按场次记录表现并完成复盘",
    updatedAt: "初始记录",
  },
  {
    id: "wechat-streaming",
    title: "视频号推流上线",
    scope: "官号直播",
    owner: "待分配",
    followers: "",
    startDate: "",
    dueDate: "",
    status: "待确认",
    priority: "中",
    progress: 10,
    latestUpdate: "计划增加电脑推流，人员复用抖音现有班组",
    nextAction: "确认设备、账号与上线时间",
    updatedAt: "初始记录",
  },
  {
    id: "official-account-information",
    title: "补充抖音官号准确名称与 UID",
    scope: "官号直播",
    owner: "待分配",
    followers: "",
    startDate: "",
    dueDate: "",
    status: "未开始",
    priority: "中",
    progress: 0,
    latestUpdate: "",
    nextAction: "确认官号基础资料",
    updatedAt: "初始记录",
  },
  {
    id: "institution-anchor-information",
    title: "补充线上机构主播真实姓名与平台 UID",
    scope: "生态主播",
    owner: "丁友发",
    followers: "杨钢",
    startDate: "",
    dueDate: "",
    status: "未开始",
    priority: "中",
    progress: 0,
    latestUpdate: "",
    nextAction: "向桃桃乐、掀桌子收集主播资料",
    updatedAt: "初始记录",
  },
  {
    id: "offline-anchor-information",
    title: "补充线下主播平台 UID",
    scope: "生态主播",
    owner: "丁友发",
    followers: "赵湘泉、姜博涛、杨宁",
    startDate: "",
    dueDate: "",
    status: "未开始",
    priority: "中",
    progress: 0,
    latestUpdate: "",
    nextAction: "由各运营补齐名下主播账号资料",
    updatedAt: "初始记录",
  },
  {
    id: "business-goals",
    title: "设置两条业务线阶段目标",
    scope: "项目管理",
    owner: "待确认",
    followers: "黄建良、杨钢、傅晓烽",
    startDate: "",
    dueDate: "",
    status: "待确认",
    priority: "高",
    progress: 0,
    latestUpdate: "",
    nextAction: "确认线下主播与官号直播的阶段指标",
    updatedAt: "初始记录",
  },
];

const EMPTY_TASK: Omit<ExecutionTask, "id" | "updatedAt"> = {
  title: "",
  scope: "项目管理",
  owner: "",
  followers: "",
  startDate: "",
  dueDate: "",
  status: "未开始",
  priority: "中",
  progress: 0,
  latestUpdate: "",
  nextAction: "",
};

const selectClassName =
  "h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15";

function statusTone(status: TaskStatus): string {
  if (status === "已完成") return "bg-emerald-50 text-emerald-700";
  if (status === "进行中") return "bg-blue-50 text-blue-700";
  if (status === "已阻塞") return "bg-red-50 text-red-700";
  if (status === "待确认") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function priorityTone(priority: TaskPriority): string {
  if (priority === "高") return "bg-red-50 text-red-700";
  if (priority === "中") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function currentTimestamp(): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function normalizeProgress(status: TaskStatus, progress: number): number {
  if (status === "已完成") return 100;
  if (status === "未开始") return 0;
  return Math.min(99, Math.max(0, progress));
}

function TaskEditor({
  open,
  task,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  task: ExecutionTask | null;
  onOpenChange: (open: boolean) => void;
  onSave: (task: ExecutionTask) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState<ExecutionTask>(() => ({
    ...EMPTY_TASK,
    id: "",
    updatedAt: "",
  }));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(
      task ?? {
        ...EMPTY_TASK,
        id: "",
        updatedAt: "",
      },
    );
    setError("");
  }, [open, task]);

  const updateDraft = <K extends keyof ExecutionTask>(key: K, value: ExecutionTask[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
  };

  const save = () => {
    if (!draft.title.trim()) {
      setError("请填写任务名称");
      return;
    }
    if (!draft.owner.trim()) {
      setError("请填写负责人，未确定时可填写“待分配”");
      return;
    }
    if (draft.startDate && draft.dueDate && draft.startDate > draft.dueDate) {
      setError("截止日期不能早于开始日期");
      return;
    }
    onSave({
      ...draft,
      id: draft.id || `execution-${Date.now()}`,
      title: draft.title.trim(),
      owner: draft.owner.trim(),
      followers: draft.followers.trim(),
      latestUpdate: draft.latestUpdate.trim(),
      nextAction: draft.nextAction.trim(),
      progress: normalizeProgress(draft.status, draft.progress),
      updatedAt: currentTimestamp(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{task ? "编辑任务" : "新增任务"}</DialogTitle>
          <DialogDescription>
            记录负责人、推进日期和下一步动作，保存后进入任务跟进表。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-xs font-medium text-slate-700">任务名称 *</span>
            <Input
              value={draft.title}
              onChange={(event) => updateDraft("title", event.target.value)}
              placeholder="例如：确认视频号推流上线时间"
              autoFocus
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-700">业务范围</span>
            <select
              className={selectClassName}
              value={draft.scope}
              onChange={(event) => updateDraft("scope", event.target.value as TaskScope)}
            >
              {SCOPES.map((scope) => (
                <option key={scope} value={scope}>
                  {scopeLabel(scope)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-700">负责人 *</span>
            <Input
              value={draft.owner}
              onChange={(event) => updateDraft("owner", event.target.value)}
              placeholder="一名主负责人或待分配"
            />
          </label>
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-xs font-medium text-slate-700">跟进人</span>
            <Input
              value={draft.followers}
              onChange={(event) => updateDraft("followers", event.target.value)}
              placeholder="多人用顿号分隔，例如：杨钢、傅晓烽"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-700">开始日期</span>
            <Input
              type="date"
              value={draft.startDate}
              onChange={(event) => updateDraft("startDate", event.target.value)}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-700">截止日期</span>
            <Input
              type="date"
              value={draft.dueDate}
              onChange={(event) => updateDraft("dueDate", event.target.value)}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-700">状态</span>
            <select
              className={selectClassName}
              value={draft.status}
              onChange={(event) => updateDraft("status", event.target.value as TaskStatus)}
            >
              {STATUSES.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-700">优先级</span>
            <select
              className={selectClassName}
              value={draft.priority}
              onChange={(event) => updateDraft("priority", event.target.value as TaskPriority)}
            >
              {PRIORITIES.map((priority) => (
                <option key={priority}>{priority}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 sm:col-span-2">
            <span className="flex items-center justify-between gap-3 text-xs font-medium text-slate-700">
              <span>任务进度</span>
              <span className="flex items-center gap-1 font-normal text-slate-500">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="5"
                  aria-label="任务进度百分比"
                  value={draft.progress}
                  disabled={draft.status === "未开始" || draft.status === "已完成"}
                  onChange={(event) =>
                    updateDraft(
                      "progress",
                      Math.min(100, Math.max(0, Number(event.target.value) || 0)),
                    )
                  }
                  className="h-7 w-20 text-right font-mono"
                />
                %
              </span>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={draft.progress}
              disabled={draft.status === "未开始" || draft.status === "已完成"}
              onChange={(event) => updateDraft("progress", Number(event.target.value))}
              className="h-2 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-xs font-medium text-slate-700">最新进展</span>
            <Textarea
              value={draft.latestUpdate}
              onChange={(event) => updateDraft("latestUpdate", event.target.value)}
              placeholder="本次已经完成或确认了什么"
              rows={2}
            />
          </label>
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-xs font-medium text-slate-700">下一步动作</span>
            <Textarea
              value={draft.nextAction}
              onChange={(event) => updateDraft("nextAction", event.target.value)}
              placeholder="下一步要做什么、需要谁配合"
              rows={2}
            />
          </label>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={save}>
            保存任务
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExecutionTaskBoard(): React.JSX.Element {
  const {
    value: tasks,
    update: updateTasks,
    ready,
    saving,
    error: syncError,
  } = useProjectSharedState<ExecutionTask[]>({
    projectKey: "zhaohua",
    stateKey: "execution_tasks",
    initialValue: INITIAL_EXECUTION_TASKS,
    localStorageKey: EXECUTION_TASK_STORAGE_KEY,
  });
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "全部">("全部");
  const [scopeFilter, setScopeFilter] = useState<TaskScope | "全部">("全部");
  const [ownerFilter, setOwnerFilter] = useState("全部");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ExecutionTask | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<ExecutionTask | null>(null);

  const owners = useMemo(
    () =>
      Array.from(new Set(tasks.map((task) => task.owner)))
        .filter(Boolean)
        .sort(),
    [tasks],
  );
  const filteredTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          (statusFilter === "全部" || task.status === statusFilter) &&
          (scopeFilter === "全部" || task.scope === scopeFilter) &&
          (ownerFilter === "全部" || task.owner === ownerFilter),
      ),
    [ownerFilter, scopeFilter, statusFilter, tasks],
  );

  const openNewTask = () => {
    setEditingTask(null);
    setEditorOpen(true);
  };

  const updateStatus = (task: ExecutionTask, status: TaskStatus) => {
    void updateTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? {
              ...item,
              status,
              progress: normalizeProgress(status, item.progress),
              updatedAt: currentTimestamp(),
            }
          : item,
      ),
    );
  };

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">执行计划</h2>
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-xs font-medium",
                syncError ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700",
              )}
            >
              {syncError ? syncError : saving ? "同步中" : ready ? "已同步" : "加载中"}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">按负责人、日期和状态持续推进项目任务</p>
        </div>
        <Button type="button" onClick={openNewTask}>
          <Plus />
          新增任务
        </Button>
      </section>

      <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 flex items-center gap-1 text-xs font-medium text-slate-500">
              <Filter className="size-3.5" />
              状态
            </span>
            {(["全部", ...STATUSES] as const).map((status) => {
              const count =
                status === "全部"
                  ? tasks.length
                  : tasks.filter((task) => task.status === status).length;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    "h-7 rounded-md px-2 text-xs font-medium transition-colors",
                    statusFilter === status
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                  )}
                >
                  {status} {count}
                </button>
              );
            })}
            <div className="ml-auto flex min-w-0 flex-wrap gap-2">
              <select
                aria-label="按业务范围筛选"
                className={cn(selectClassName, "w-32 text-xs")}
                value={scopeFilter}
                onChange={(event) => setScopeFilter(event.target.value as TaskScope | "全部")}
              >
                <option value="全部">全部业务</option>
                {SCOPES.map((scope) => (
                  <option key={scope} value={scope}>
                    {scopeLabel(scope)}
                  </option>
                ))}
              </select>
              <select
                aria-label="按负责人筛选"
                className={cn(selectClassName, "w-32 text-xs")}
                value={ownerFilter}
                onChange={(event) => setOwnerFilter(event.target.value)}
              >
                <option value="全部">全部负责人</option>
                {owners.map((owner) => (
                  <option key={owner}>{owner}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {filteredTasks.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center px-4 text-center">
            <CircleDashed className="size-6 text-slate-300" />
            <p className="mt-2 text-sm font-medium text-slate-700">当前筛选下没有任务</p>
            <button
              type="button"
              onClick={() => {
                setStatusFilter("全部");
                setScopeFilter("全部");
                setOwnerFilter("全部");
              }}
              className="mt-1 text-xs text-primary hover:underline"
            >
              清除筛选
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[1120px]">
              <div className="grid grid-cols-[minmax(240px,1.3fr)_100px_130px_150px_120px_150px_minmax(220px,1fr)_72px] items-center bg-slate-50 px-4 py-2.5 text-xs font-medium text-slate-500">
                <span>任务 / 进展</span>
                <span>业务范围</span>
                <span>负责人</span>
                <span>日期</span>
                <span>状态</span>
                <span>进度</span>
                <span>下一步 / 跟进人</span>
                <span className="text-right">操作</span>
              </div>
              <div className="divide-y divide-slate-100">
                {filteredTasks.map((task) => (
                  <article
                    key={task.id}
                    className="grid grid-cols-[minmax(240px,1.3fr)_100px_130px_150px_120px_150px_minmax(220px,1fr)_72px] items-center px-4 py-3 text-sm hover:bg-slate-50/60"
                  >
                    <div className="min-w-0 pr-4">
                      <div className="flex items-start gap-2">
                        {task.status === "已完成" ? (
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                        ) : (
                          <CircleDashed className="mt-0.5 size-4 shrink-0 text-slate-300" />
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{task.title}</p>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                            {task.latestUpdate || "暂无进展记录"}
                          </p>
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-slate-600">{scopeLabel(task.scope)}</span>
                    <div className="min-w-0 pr-2">
                      <p className="truncate font-medium text-slate-700">{task.owner}</p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-400">
                        更新 {task.updatedAt}
                      </p>
                    </div>
                    <div className="space-y-1 text-xs text-slate-600">
                      <p className="flex items-center gap-1">
                        <CalendarDays className="size-3 text-slate-400" />
                        {task.startDate || "开始待定"}
                      </p>
                      <p className="pl-4 text-slate-500">至 {task.dueDate || "截止待定"}</p>
                    </div>
                    <select
                      aria-label={`修改${task.title}状态`}
                      value={task.status}
                      onChange={(event) => updateStatus(task, event.target.value as TaskStatus)}
                      className={cn(
                        "h-7 w-[104px] rounded-md border-0 px-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/20",
                        statusTone(task.status),
                      )}
                    >
                      {STATUSES.map((status) => (
                        <option key={status} className="bg-white text-slate-800">
                          {status}
                        </option>
                      ))}
                    </select>
                    <div className="pr-5">
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                        <span className={cn("rounded px-1.5 py-0.5", priorityTone(task.priority))}>
                          {task.priority}优先
                        </span>
                        <span className="font-mono text-slate-500">{task.progress}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            task.status === "已完成" ? "bg-emerald-500" : "bg-blue-500",
                          )}
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                    </div>
                    <div className="min-w-0 pr-3 text-xs">
                      <p className="line-clamp-2 leading-5 text-slate-600">
                        {task.nextAction || "下一步待补充"}
                      </p>
                      <p className="mt-1 flex items-center gap-1 truncate text-slate-400">
                        <UserRound className="size-3 shrink-0" />
                        {task.followers || "跟进人待补充"}
                      </p>
                    </div>
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTask(task);
                          setEditorOpen(true);
                        }}
                        className="flex size-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        title="编辑任务"
                        aria-label={`编辑 ${task.title}`}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setTaskToDelete(task)}
                        className="flex size-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title="删除任务"
                        aria-label={`删除 ${task.title}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <TaskEditor
        open={editorOpen}
        task={editingTask}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditingTask(null);
        }}
        onSave={(task) => {
          void updateTasks((current) => {
            const existing = current.some((item) => item.id === task.id);
            return existing
              ? current.map((item) => (item.id === task.id ? task : item))
              : [task, ...current];
          });
          setEditorOpen(false);
          setEditingTask(null);
        }}
      />
      <ConfirmDialog
        open={taskToDelete !== null}
        title="删除这个任务？"
        description={taskToDelete ? `「${taskToDelete.title}」及其跟进记录将被移除。` : undefined}
        confirmText="确认删除"
        variant="danger"
        onOpenChange={(open) => {
          if (!open) setTaskToDelete(null);
        }}
        onConfirm={() => {
          if (!taskToDelete) return;
          void updateTasks((current) => current.filter((task) => task.id !== taskToDelete.id));
          setTaskToDelete(null);
        }}
      />
    </div>
  );
}
