"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { z } from "zod";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Circle,
  FastForward,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  SelfReviewInput,
  calculateReviewScore,
  calculateWeightedScore,
  gradeForScore,
  createManualPerformanceCycle,
  confirmPerformanceResult,
  getPeoplePerformanceDetailAction,
  openPerformanceSelfReview,
  returnPerformanceForReview,
  syncPersonFromDingtalkRoster,
  STAGE_LABEL,
  submitPerformanceGoals,
  withdrawPerformanceSelfReview,
  PERFORMANCE_RATINGS,
  type PeoplePerformanceDetail,
  type PerformanceCycleView,
} from "@/modules/people-performance";

import { ManagerCombobox } from "./manager-combobox";

const PersonAttendanceCalendar = dynamic(
  () => import("@/modules/attendance/client").then((module) => module.PersonAttendanceCalendar),
  { ssr: false },
);

const FLOW = [
  "goal_setting",
  "goal_review",
  "in_progress",
  "self_review",
  "manager_review",
  "skip_manager_review",
  "hr_calibration",
  "employee_confirm",
  "completed",
] as const;

export function PerformanceDrawer({ userId, onClose }: { userId: string; onClose: () => void }) {
  const router = useRouter();
  const [detail, setDetail] = useState<PeoplePerformanceDetail | null>(null);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [loading, startLoading] = useTransition();

  const refresh = useCallback(() => {
    startLoading(async () => {
      try {
        const next = await getPeoplePerformanceDetailAction({ userId });
        setDetail(next);
        setSelectedCycleId((current) =>
          current &&
          next.cycles.some(
            (cycle) =>
              cycle.id === current && cycleMatchesStatus(cycle, next.profile.employmentStatus),
          )
            ? current
            : preferredCycleId(next.cycles, next.profile.employmentStatus),
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "加载失败");
      }
    });
  }, [userId]);

  useEffect(() => refresh(), [refresh]);

  if (!detail) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">加载中...</div>
    );
  }
  const cycle = detail.cycles.find((item) => item.id === selectedCycleId) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50/60">
      <header className="shrink-0 border-b bg-white px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-slate-900">
                {detail.person.name}的人员考核
              </h2>
              <StatusPill status={detail.profile.employmentStatus} />
            </div>
            <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
              <span>{detail.person.department || "未设置部门"}</span>
              <span>·</span>
              <span>{detail.person.title ?? "未设置岗位"}</span>
              <span>·</span>
              <span>
                {detail.profile.hireDate ? `${detail.profile.hireDate}入职` : "未配置入职日期"}
              </span>
              <span>·</span>
              <span>直属上级：{detail.person.managerName ?? "未配置"}</span>
              <span>·</span>
              <span>隔级上级：{detail.person.skipManagerName ?? "未配置"}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {detail.capabilities.manageProfiles && (
              <Button size="sm" variant="outline" onClick={() => setProfileOpen((open) => !open)}>
                配置档案
              </Button>
            )}
            <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="关闭">
              <X />
            </Button>
          </div>
        </div>
        {profileOpen && (
          <ProfileEditor
            detail={detail}
            onSaved={() => {
              setProfileOpen(false);
              refresh();
              router.refresh();
            }}
          />
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-[245px] shrink-0 overflow-y-auto border-r bg-white p-3">
          <div className="mb-2 px-2 text-xs font-medium text-muted-foreground">考核周期</div>
          {detail.cycles.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
              配置人员档案后自动生成周期
            </div>
          ) : (
            detail.cycles.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedCycleId(item.id)}
                className={`mb-1 w-full rounded-md px-3 py-2.5 text-left transition-colors ${selectedCycleId === item.id ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{item.label}</span>
                  <ChevronRight className="size-3.5 shrink-0" />
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    {item.periodStart} 至 {item.periodEnd}
                  </span>
                </div>
                <div className="mt-1 text-[11px]">
                  {item.kind === "quarterly" ? "季度汇总" : STAGE_LABEL[item.stage]}
                </div>
              </button>
            ))
          )}
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          {cycle ? (
            <CyclePanel
              key={cycle.id}
              detail={detail}
              cycle={cycle}
              onChanged={() => {
                refresh();
                router.refresh();
              }}
              onListChanged={() => router.refresh()}
              loading={loading}
            />
          ) : (
            <div className="grid h-full place-items-center p-6">
              <div className="max-w-sm rounded-md border border-dashed bg-white px-8 py-10 text-center">
                <div className="text-sm font-medium text-slate-800">尚未建立考核档案</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {detail.capabilities.manageProfiles
                    ? "设置入职日期、直属上级和人员状态后，将自动生成考核周期。"
                    : "请联系人员绩效管理员完成档案配置。"}
                </div>
                {detail.capabilities.manageProfiles && (
                  <Button className="mt-4" size="sm" onClick={() => setProfileOpen(true)}>
                    配置人员档案
                  </Button>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function cycleMatchesStatus(
  cycle: PerformanceCycleView,
  status: PeoplePerformanceDetail["profile"]["employmentStatus"],
): boolean {
  return (
    (status === "probation" && cycle.kind === "probation") ||
    (status === "regular" && cycle.kind === "monthly")
  );
}

function preferredCycleId(
  cycles: PerformanceCycleView[],
  status: PeoplePerformanceDetail["profile"]["employmentStatus"],
): string | null {
  const actionable = cycles
    .filter(
      (cycle) =>
        cycleMatchesStatus(cycle, status) &&
        cycle.stage !== "scheduled" &&
        cycle.stage !== "completed" &&
        cycle.stage !== "cancelled",
    )
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  if (actionable[0]) return actionable[0].id;
  const upcoming = cycles
    .filter((cycle) => cycleMatchesStatus(cycle, status) && cycle.stage === "scheduled")
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  return upcoming[0]?.id ?? cycles.find((cycle) => cycleMatchesStatus(cycle, status))?.id ?? null;
}

function ProfileEditor({
  detail,
  onSaved,
}: {
  detail: PeoplePerformanceDetail;
  onSaved: () => void;
}) {
  const [managerUserId, setManagerUserId] = useState(detail.profile.managerUserId ?? "");
  const [skipManagerUserId, setSkipManagerUserId] = useState(
    detail.profile.skipManagerUserId ?? "",
  );
  const [hireDate, setHireDate] = useState(detail.profile.hireDate ?? "");
  const [status, setStatus] = useState(detail.profile.employmentStatus ?? "probation");
  const [months, setMonths] = useState(String(detail.profile.probationMonths ?? 2));
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 rounded-md border bg-slate-50 p-3 md:grid-cols-6">
      <div className="col-span-full flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          可从钉钉带入入职日期、岗位和部门，上级关系仍需人工确认。
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                const result = await syncPersonFromDingtalkRoster({
                  userId: detail.person.userId,
                });
                if (result.hireDate) setHireDate(result.hireDate);
                toast.success(
                  result.hireDate ? "已同步钉钉花名册资料" : "已同步，钉钉未填写入职日期",
                );
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "同步失败");
              }
            })
          }
        >
          <RefreshCw />
          同步钉钉花名册
        </Button>
      </div>
      <Field label="入职日期">
        <Input type="date" value={hireDate} onChange={(event) => setHireDate(event.target.value)} />
      </Field>
      <Field label="直接上级">
        <ManagerCombobox
          managers={detail.managers}
          value={managerUserId || null}
          placeholder="选择直接上级"
          onValueChange={(value) => setManagerUserId(value ?? "")}
        />
      </Field>
      <Field label="隔级上级">
        <ManagerCombobox
          managers={detail.managers}
          value={skipManagerUserId || null}
          placeholder="不配置隔级上级"
          allowClear
          onValueChange={(value) => setSkipManagerUserId(value ?? "")}
        />
      </Field>
      <Field label="人员状态">
        <Select
          value={status}
          onValueChange={(value) => value && setStatus(value as typeof status)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="probation">试用期</SelectItem>
            <SelectItem value="regular">正式</SelectItem>
            <SelectItem value="inactive">停用</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="试用期类型">
        <Select
          value={months}
          onValueChange={(value) => setMonths(value ?? "2")}
          disabled={status !== "probation"}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2">2个月</SelectItem>
            <SelectItem value="3">3个月</SelectItem>
            <SelectItem value="6">6个月</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <div className="flex items-end">
        <Button
          className="w-full"
          disabled={pending || !managerUserId || !hireDate}
          onClick={() =>
            startTransition(async () => {
              try {
                await submitAssessment("save_profile", {
                  userId: detail.person.userId,
                  managerUserId,
                  skipManagerUserId: skipManagerUserId || null,
                  hireDate,
                  employmentStatus: status,
                  probationMonths: Number(months),
                  regularizedAt:
                    status === "regular" ? new Date().toISOString().slice(0, 10) : null,
                });
                toast.success("人员考核档案已保存");
                onSaved();
              } catch (error) {
                toast.error(performanceErrorMessage(error));
              }
            })
          }
        >
          保存配置
        </Button>
      </div>
    </div>
  );
}

function CyclePanel({
  detail,
  cycle,
  onChanged,
  onListChanged,
  loading,
}: {
  detail: PeoplePerformanceDetail;
  cycle: PerformanceCycleView;
  onChanged: () => void;
  onListChanged: () => void;
  loading: boolean;
}) {
  const [confirmSelfReview, setConfirmSelfReview] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const closeAttendance = useCallback(() => setAttendanceOpen(false), []);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReturnToHr, setConfirmReturnToHr] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualKind, setManualKind] = useState<"monthly" | "quarterly">("monthly");
  const [manualStart, setManualStart] = useState(new Date().toISOString().slice(0, 10));
  const [advancing, startAdvancing] = useTransition();
  const defaultTab = canHandleCurrentStage(detail, cycle)
    ? "form"
    : cycle.stage === "completed"
      ? "result"
      : "flow";
  return (
    <div className="p-5">
      <div className="mb-4 flex items-start justify-between gap-4 rounded-md border bg-white px-4 py-3">
        <div>
          <div className="font-semibold text-slate-900">{cycle.label}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {cycle.periodStart} 至 {cycle.periodEnd} · 当前环节：{STAGE_LABEL[cycle.stage]}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {cycle.kind === "probation" &&
            cycle.stage === "scheduled" &&
            (detail.capabilities.actorUserId === detail.person.userId ||
              detail.capabilities.actorUserId === cycle.managerUserId ||
              detail.capabilities.manageProfiles ||
              detail.capabilities.manageAll) && (
              <Button
                size="sm"
                disabled={loading || advancing}
                onClick={() =>
                  startAdvancing(async () => {
                    try {
                      await submitAssessment("open_goals", { cycleId: cycle.id });
                      toast.success("目标填写已提前开启，考核起止日期不变");
                      onChanged();
                    } catch (error) {
                      toast.error(performanceErrorMessage(error));
                    }
                  })
                }
              >
                提前开启目标填写
              </Button>
            )}
          {detail.capabilities.manageProfiles && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setManualOpen((value) => !value)}
            >
              新增考核周期
            </Button>
          )}
          {(detail.capabilities.manageProfiles || detail.capabilities.manageAll) && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                window.location.href = `/api/people-performance/export?cycleId=${encodeURIComponent(cycle.id)}`;
              }}
            >
              导出考核表
            </Button>
          )}
          {detail.capabilities.manageProfiles && (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
              aria-label={`删除${cycle.label}`}
              title="删除考核周期"
              disabled={loading || advancing}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 />
            </Button>
          )}
          {cycle.stage === "in_progress" && detail.capabilities.manageAll && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading || advancing}
              onClick={() => setConfirmSelfReview(true)}
            >
              <FastForward />
              结束执行并开启自评
            </Button>
          )}
          {cycle.stage === "manager_review" &&
            (detail.capabilities.actorUserId === detail.person.userId ||
              detail.capabilities.manageAll) && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={loading || advancing}
                onClick={() =>
                  startAdvancing(async () => {
                    try {
                      await withdrawPerformanceSelfReview({ cycleId: cycle.id });
                      toast.success("已撤回自评，可重新填写");
                      onChanged();
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "撤回失败");
                    }
                  })
                }
              >
                撤回并修改自评
              </Button>
            )}
          {cycle.finalGrade && <Rating rating={cycle.finalGrade} score={cycle.finalScore} />}
          {cycle.stage === "employee_confirm" &&
            (detail.capabilities.calibrate || detail.capabilities.manageAll) && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={loading || advancing}
                onClick={() => setConfirmReturnToHr(true)}
                className="border-red-300 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
              >
                <AlertTriangle />
                撤回到HR校准
              </Button>
            )}
        </div>
      </div>
      {manualOpen && detail.capabilities.manageProfiles && (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-md border bg-slate-50 p-3">
          <Field label="周期类型">
            <Select
              value={manualKind}
              onValueChange={(value) => value && setManualKind(value as typeof manualKind)}
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">月度</SelectItem>
                <SelectItem value="quarterly">季度</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="开始日期">
            <Input
              type="date"
              value={manualStart}
              onChange={(event) => setManualStart(event.target.value)}
            />
          </Field>
          <Button
            type="button"
            onClick={() =>
              startAdvancing(async () => {
                try {
                  await createManualPerformanceCycle({
                    userId: detail.person.userId,
                    kind: manualKind,
                    periodStart: manualStart,
                  });
                  toast.success("考核周期已创建");
                  setManualOpen(false);
                  onChanged();
                  onListChanged();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "创建失败");
                }
              })
            }
            disabled={advancing || !manualStart}
          >
            创建
          </Button>
        </div>
      )}
      <Tabs defaultValue={defaultTab}>
        <div className="flex flex-wrap items-center gap-3">
          <TabsList variant="line" className="border-b">
            <TabsTrigger value="flow">考核流程</TabsTrigger>
            <TabsTrigger value="form">考核表</TabsTrigger>
            <TabsTrigger value="result">考核结果</TabsTrigger>
            {detail.capabilities.manageAll && <TabsTrigger value="events">变更记录</TabsTrigger>}
          </TabsList>
          <Button type="button" size="sm" variant="outline" onClick={() => setAttendanceOpen(true)}>
            本月考勤
          </Button>
        </div>
        {attendanceOpen && (
          <PersonAttendanceCalendar
            userId={detail.person.userId}
            name={detail.person.name}
            onClose={closeAttendance}
          />
        )}
        <TabsContent value="flow" className="pt-4">
          <FlowView cycle={cycle} />
        </TabsContent>
        <TabsContent value="form" className="pt-4">
          <AssessmentForm
            key={`${cycle.id}:${cycle.stage}`}
            detail={detail}
            cycle={cycle}
            onChanged={onChanged}
            loading={loading}
          />
        </TabsContent>
        <TabsContent value="result" className="pt-4">
          <ResultView cycle={cycle} />
        </TabsContent>
        {detail.capabilities.manageAll && (
          <TabsContent value="events" className="pt-4">
            <EventsView detail={detail} cycle={cycle} />
          </TabsContent>
        )}
      </Tabs>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`删除“${cycle.label}”？`}
        description="该周期的目标、评分、评语和变更记录会一并永久删除。"
        confirmText="确认删除"
        variant="danger"
        onConfirm={() =>
          startAdvancing(async () => {
            try {
              await deleteCycle(cycle.id);
              toast.success("考核周期已删除");
              onChanged();
              onListChanged();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "删除失败");
            }
          })
        }
      />
      <ConfirmDialog
        open={confirmSelfReview}
        onOpenChange={setConfirmSelfReview}
        title="提前结束执行阶段？"
        description="确认后将立即开启员工自评，并通知员工处理。本操作会记录在变更记录中。"
        confirmText="开启自评"
        onConfirm={() =>
          startAdvancing(async () => {
            try {
              await openPerformanceSelfReview({ cycleId: cycle.id });
              toast.success("已开启员工自评");
              onChanged();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "操作失败");
            }
          })
        }
      />
      <ConfirmDialog
        open={confirmReturnToHr}
        onOpenChange={setConfirmReturnToHr}
        title="确认撤回到HR校准？"
        description="撤回后将清除当前最终得分和评级，HR需要重新校准。该操作会记录在变更记录中。"
        confirmText="确认撤回"
        variant="danger"
        onConfirm={() =>
          startAdvancing(async () => {
            try {
              await returnPerformanceForReview({
                cycleId: cycle.id,
                targetStage: "hr_calibration",
              });
              toast.success("已撤回到HR校准");
              onChanged();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "撤回失败");
            }
          })
        }
      />
    </div>
  );
}

function canHandleCurrentStage(
  detail: PeoplePerformanceDetail,
  cycle: PerformanceCycleView,
): boolean {
  const actor = detail.capabilities.actorUserId;
  const isEmployee = actor === detail.person.userId || detail.capabilities.manageAll;
  const isManager = actor === cycle.managerUserId || detail.capabilities.manageAll;
  const isSkipManager = actor === cycle.skipManagerUserId || detail.capabilities.manageAll;
  if (cycle.stage === "goal_setting" || cycle.stage === "self_review") return isEmployee;
  if (cycle.stage === "goal_review" || cycle.stage === "manager_review") return isManager;
  if (cycle.stage === "skip_manager_review") return isSkipManager;
  if (cycle.stage === "hr_calibration") return detail.capabilities.calibrate;
  if (cycle.stage === "employee_confirm") return isEmployee;
  return false;
}

function FlowView({ cycle }: { cycle: PerformanceCycleView }) {
  const flow: readonly PerformanceCycleView["stage"][] = FLOW.filter((stage) => {
    if (
      stage === "skip_manager_review" &&
      (cycle.kind === "probation" || !cycle.skipManagerUserId)
    ) {
      return false;
    }
    if (
      !cycle.requiresFinalReview &&
      (stage === "employee_confirm" || (stage === "hr_calibration" && cycle.kind !== "probation"))
    ) {
      return false;
    }
    return true;
  });
  const current = flow.indexOf(cycle.stage);
  return (
    <div className="rounded-md border bg-white px-6 py-5">
      {flow.map((stage, index) => {
        const completed = current > index || cycle.stage === "completed";
        const active = cycle.stage === stage;
        return (
          <div key={stage} className="relative flex min-h-20 gap-4 pb-5 last:min-h-0 last:pb-0">
            {index < flow.length - 1 && (
              <div
                className={`absolute left-[9px] top-5 h-full w-px ${completed ? "bg-emerald-300" : "bg-slate-200"}`}
              />
            )}
            <div
              className={`relative z-10 mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${completed ? "bg-emerald-500 text-white" : active ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"}`}
            >
              {completed ? (
                <Check className="size-3" />
              ) : active ? (
                <Circle className="size-2 fill-current" />
              ) : null}
            </div>
            <div>
              <div className={`text-sm font-medium ${active ? "text-blue-700" : "text-slate-800"}`}>
                {STAGE_LABEL[stage]}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {active ? "当前执行中" : completed ? "已完成" : "等待前一环节完成后开启"}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface EditableGoal {
  id?: string;
  title: string;
  description: string;
  metric: string;
  targetValue: string;
  weight: number;
  completion?: string;
  selfScore?: number;
  managerScore?: number;
  managerComment?: string;
  skipManagerScore?: number;
  skipManagerComment?: string;
}

function performanceErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "请检查填写内容";
  if (error instanceof Error && /[\u4e00-\u9fff]/u.test(error.message)) return error.message;
  return "操作失败，请稍后重试；若页面已长时间未刷新，请先保存填写内容再刷新页面";
}

async function submitAssessment(operation: string, input: unknown): Promise<void> {
  const response = await fetch("/api/people-performance/assessment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation, input }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message ?? "提交失败，请稍后重试");
}

async function reviewGoals(input: {
  cycleId: string;
  approved: boolean;
  comment: string;
}): Promise<void> {
  const response = await fetch("/api/people-performance/goals/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "目标审核失败，请稍后重试");
  }
}

async function deleteCycle(cycleId: string): Promise<void> {
  const response = await fetch("/api/people-performance/cycles", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cycleId }),
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "删除考核周期失败，请稍后重试");
  }
}

function ReadOnlyGoalText({ value }: { value: string }) {
  return (
    <div className="min-h-8 whitespace-pre-wrap break-words rounded-lg border border-input bg-slate-50 px-2.5 py-2 text-sm leading-6 text-slate-700">
      {value || "-"}
    </div>
  );
}

function AssessmentForm({
  detail,
  cycle,
  onChanged,
}: {
  detail: PeoplePerformanceDetail;
  cycle: PerformanceCycleView;
  onChanged: () => void;
  loading: boolean;
}) {
  const initialGoals = useMemo<EditableGoal[]>(
    () =>
      cycle.goals.map((goal) => ({
        id: goal.id,
        title: goal.title,
        description: goal.description,
        metric: goal.metric,
        targetValue: goal.targetValue,
        weight: goal.weight,
        completion: goal.completion ?? "",
        selfScore: goal.selfScore ?? undefined,
        managerScore: goal.managerScore ?? undefined,
        managerComment: goal.managerComment ?? "",
        skipManagerScore: goal.skipManagerScore ?? undefined,
        skipManagerComment: goal.skipManagerComment ?? "",
      })),
    [cycle],
  );
  const [goals, setGoals] = useState<EditableGoal[]>(
    initialGoals.length
      ? initialGoals
      : [{ title: "", description: "", metric: "", targetValue: "", weight: 100 }],
  );
  const [summary, setSummary] = useState("");
  const [comment, setComment] = useState("");
  const suggestedDirectScore = calculateWeightedScore(
    cycle.goals.map((goal) => ({ weight: goal.weight, managerScore: goal.managerScore })),
  );
  const suggestedSkipScore = calculateWeightedScore(
    cycle.goals.map((goal) => ({ weight: goal.weight, managerScore: goal.skipManagerScore })),
  );
  const suggestedScore = calculateReviewScore(
    cycle.kind,
    suggestedDirectScore,
    cycle.skipManagerUserId ? suggestedSkipScore : null,
  );
  const calibrationScore = cycle.finalScore ?? suggestedScore;
  const [score] = useState(calibrationScore);
  const [rating, setRating] = useState<string>(
    PERFORMANCE_RATINGS.find((item) => item.value === cycle.finalGrade)?.value ?? "",
  );
  const directManagerTotal = calculateWeightedScore(
    goals.map((goal) => ({ weight: goal.weight, managerScore: goal.managerScore ?? null })),
  );
  const skipManagerTotal = calculateWeightedScore(
    goals.map((goal) => ({ weight: goal.weight, managerScore: goal.skipManagerScore ?? null })),
  );
  const previewFinalScore = calculateReviewScore(
    cycle.kind,
    directManagerTotal,
    cycle.skipManagerUserId ? skipManagerTotal : null,
  );
  const [probationResult, setProbationResult] = useState(cycle.probationResult ?? "passed");
  const [pending, startTransition] = useTransition();
  const [confirmGoalReturn, setConfirmGoalReturn] = useState(false);
  const [confirmAssessmentReturn, setConfirmAssessmentReturn] = useState(false);
  const [returnStage, setReturnStage] = useState<
    "self_review" | "manager_review" | "skip_manager_review"
  >("self_review");
  const actor = detail.capabilities.actorUserId;
  const isEmployee = actor === detail.person.userId || detail.capabilities.manageAll;
  const isManager = actor === cycle.managerUserId || detail.capabilities.manageAll;
  const isSkipManager = actor === cycle.skipManagerUserId || detail.capabilities.manageAll;
  const updateGoal = (index: number, patch: Partial<EditableGoal>) =>
    setGoals((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const run = (action: () => Promise<unknown>, message: string) =>
    startTransition(async () => {
      try {
        await action();
        toast.success(message);
        onChanged();
      } catch (error) {
        toast.error(performanceErrorMessage(error));
      }
    });
  const performReturn = () =>
    run(
      () => returnPerformanceForReview({ cycleId: cycle.id, targetStage: returnStage }),
      `已退回${STAGE_LABEL[returnStage]}`,
    );

  if (cycle.kind === "quarterly") return <QuarterSummary detail={detail} cycle={cycle} />;
  return (
    <div className="space-y-3">
      {goals.map((goal, index) => (
        <section key={goal.id ?? index} className="rounded-md border bg-white p-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Label className="shrink-0 text-base font-semibold">目标名称</Label>
                {cycle.stage === "goal_setting" ? (
                  <Textarea
                    aria-label={`目标${index + 1}名称`}
                    className="min-h-8 w-full resize-none py-1.5 text-sm leading-6"
                    value={goal.title}
                    onChange={(event) => updateGoal(index, { title: event.target.value })}
                  />
                ) : (
                  <div className="flex min-h-8 max-w-[520px] items-center truncate rounded-lg border border-input bg-slate-50 px-2.5 py-1.5 text-sm leading-6 text-slate-700">
                    {goal.title || "未命名目标"}
                  </div>
                )}
              </div>
              <div className="flex w-[150px] shrink-0 items-center gap-2">
                <Label className="shrink-0">权重</Label>
                {cycle.stage === "goal_setting" ? (
                  <Input
                    aria-label={`目标${index + 1}权重`}
                    className="w-[90px] border-amber-300 bg-amber-50 text-center font-semibold text-amber-700 focus-visible:border-amber-500 focus-visible:ring-amber-300"
                    type="number"
                    min={1}
                    max={100}
                    value={goal.weight}
                    onChange={(event) => updateGoal(index, { weight: Number(event.target.value) })}
                  />
                ) : (
                  <span className="inline-flex min-h-9 min-w-[68px] items-center justify-center rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-sm font-semibold text-amber-700">
                    {goal.weight}%
                  </span>
                )}
              </div>
            </div>
            {cycle.stage === "goal_setting" && goals.length > 1 && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setGoals((items) => items.filter((_, i) => i !== index))}
              >
                <Trash2 />
              </Button>
            )}
          </div>
          <div className="overflow-x-auto pb-1">
            <div className="grid min-w-[900px] grid-cols-3 gap-3">
              <Field label="目标说明">
                {cycle.stage === "goal_setting" ? (
                  <Textarea
                    value={goal.description}
                    onChange={(event) => updateGoal(index, { description: event.target.value })}
                  />
                ) : (
                  <ReadOnlyGoalText value={goal.description} />
                )}
              </Field>
              <Field label="衡量标准 / 目标值">
                {cycle.stage === "goal_setting" ? (
                  <Textarea
                    value={goal.targetValue}
                    onChange={(event) =>
                      updateGoal(index, {
                        targetValue: event.target.value,
                        metric: event.target.value,
                      })
                    }
                  />
                ) : (
                  <ReadOnlyGoalText value={goal.targetValue} />
                )}
              </Field>
              {(cycle.stage === "self_review" || goal.completion) && (
                <Field label="完成情况">
                  <Textarea
                    disabled={cycle.stage !== "self_review"}
                    value={goal.completion ?? ""}
                    onChange={(event) => updateGoal(index, { completion: event.target.value })}
                  />
                </Field>
              )}
            </div>
            {(cycle.stage === "self_review" ||
              cycle.stage === "manager_review" ||
              cycle.stage === "skip_manager_review" ||
              cycle.stage === "hr_calibration" ||
              cycle.stage === "employee_confirm" ||
              cycle.stage === "completed" ||
              goal.selfScore !== undefined ||
              goal.managerScore !== undefined ||
              goal.skipManagerScore !== undefined) && (
              <div className="mt-3 ml-auto grid w-full max-w-[720px] grid-cols-3 gap-4">
                <div className="flex items-center justify-end gap-2">
                  <Label className="shrink-0 text-base font-semibold">自评分</Label>
                  <Input
                    className="performance-score-input w-[80px] appearance-none text-base"
                    disabled={cycle.stage !== "self_review"}
                    type="number"
                    min={0}
                    max={goal.weight}
                    value={goal.selfScore ?? ""}
                    onChange={(event) =>
                      updateGoal(index, {
                        selfScore:
                          event.target.value === "" ? undefined : Number(event.target.value),
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Label className="shrink-0 text-base font-semibold">直接上级评分</Label>
                  <Input
                    className="performance-score-input w-[80px] appearance-none text-base"
                    disabled={cycle.stage !== "manager_review"}
                    type="number"
                    min={0}
                    max={goal.weight}
                    value={goal.managerScore ?? ""}
                    onChange={(event) =>
                      updateGoal(index, {
                        managerScore:
                          event.target.value === "" ? undefined : Number(event.target.value),
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Label className="shrink-0 text-base font-semibold">隔级上级评分</Label>
                  <Input
                    className="performance-score-input w-[80px] appearance-none text-base"
                    disabled={cycle.stage !== "skip_manager_review"}
                    type="number"
                    min={0}
                    max={goal.weight}
                    value={goal.skipManagerScore ?? ""}
                    onChange={(event) =>
                      updateGoal(index, {
                        skipManagerScore:
                          event.target.value === "" ? undefined : Number(event.target.value),
                      })
                    }
                  />
                </div>
              </div>
            )}
          </div>
        </section>
      ))}
      {(cycle.managerSummary || cycle.skipManagerSummary) && (
        <div className="grid gap-3 md:grid-cols-2">
          {cycle.managerSummary && cycle.stage !== "manager_review" && (
            <div className="rounded-md border border-blue-100 bg-blue-50/60 p-3">
              <div className="text-xs font-medium text-blue-700">直接上级整体评语</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                {cycle.managerSummary}
              </div>
            </div>
          )}
          {cycle.skipManagerSummary && cycle.stage !== "skip_manager_review" && (
            <div className="rounded-md border border-indigo-100 bg-indigo-50/60 p-3">
              <div className="text-xs font-medium text-indigo-700">隔级上级整体评语</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                {cycle.skipManagerSummary}
              </div>
            </div>
          )}
        </div>
      )}
      {cycle.stage === "goal_setting" && isEmployee && (
        <Button
          variant="outline"
          onClick={() =>
            setGoals((items) => [
              ...items,
              { title: "", description: "", metric: "", targetValue: "", weight: 0 },
            ])
          }
        >
          <Plus />
          新增目标
        </Button>
      )}

      {cycle.stage === "goal_setting" && isEmployee && (
        <ActionBar>
          <span>权重合计：{goals.reduce((sum, goal) => sum + goal.weight, 0)}%</span>
          <Button
            disabled={pending}
            onClick={() =>
              run(() => submitPerformanceGoals({ cycleId: cycle.id, goals }), "目标已提交审核")
            }
          >
            提交目标
          </Button>
        </ActionBar>
      )}
      {cycle.stage === "goal_review" && isManager && (
        <ActionBar>
          <Input
            className="max-w-md"
            placeholder="审核意见（退回时建议填写）"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
          <div className="flex gap-2">
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => setConfirmGoalReturn(true)}
            >
              <AlertTriangle />
              退回修改
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () => reviewGoals({ cycleId: cycle.id, approved: true, comment }),
                  "目标审核通过",
                )
              }
            >
              审核通过
            </Button>
          </div>
        </ActionBar>
      )}
      {cycle.stage === "self_review" && isEmployee && (
        <ReviewFooter label="自评总结（必填）" value={summary} onChange={setSummary}>
          <Button
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  submitAssessment(
                    "self_review",
                    SelfReviewInput.parse({
                      cycleId: cycle.id,
                      summary,
                      goals: goals.map((goal) => ({
                        id: goal.id,
                        completion: goal.completion,
                        score: goal.selfScore,
                      })),
                    }),
                  ),
                "自评已提交",
              )
            }
          >
            提交自评
          </Button>
        </ReviewFooter>
      )}
      {cycle.stage === "manager_review" && isManager && (
        <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          直接上级评分合计：
          <strong className="ml-1">
            {directManagerTotal === null ? "待完成全部评分" : directManagerTotal}
          </strong>
        </div>
      )}
      {cycle.stage === "manager_review" && isManager && (
        <ReviewFooter label="直接上级整体评语" value={summary} onChange={setSummary}>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => setConfirmAssessmentReturn(true)}
          >
            <AlertTriangle />
            退回员工自评
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  submitAssessment("manager_review", {
                    cycleId: cycle.id,
                    summary,
                    goals: goals.map((goal) => ({
                      id: goal.id,
                      score: goal.managerScore,
                      comment: goal.managerComment,
                    })),
                  }),
                "直接上级评估已提交",
              )
            }
          >
            提交评估
          </Button>
        </ReviewFooter>
      )}
      {cycle.stage === "skip_manager_review" && isSkipManager && (
        <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <div>
            隔级上级评分合计：
            <strong className="ml-1">
              {skipManagerTotal === null ? "待完成全部评分" : skipManagerTotal}
            </strong>
          </div>
          <div className="mt-2 text-base font-medium text-blue-900">
            预览综合得分：
            <strong className="ml-1">
              {previewFinalScore === null ? "待完成全部评分" : previewFinalScore}
            </strong>
          </div>
          <div className="mt-1 text-xs text-blue-700">
            最终得分 = 直接上级 {directManagerTotal ?? "-"} × 40% + 隔级上级{" "}
            {skipManagerTotal ?? "-"} × 60%
          </div>
        </div>
      )}
      {cycle.stage === "skip_manager_review" && isSkipManager && (
        <ReviewFooter label="隔级上级整体评语" value={summary} onChange={setSummary}>
          <div className="flex items-center gap-2">
            <Select
              value={returnStage}
              onValueChange={(value) => value && setReturnStage(value as typeof returnStage)}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue>
                  {(value) => STAGE_LABEL[value as keyof typeof STAGE_LABEL] ?? "退回到"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manager_review">直属上级评估</SelectItem>
                <SelectItem value="self_review">员工自评</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => setConfirmAssessmentReturn(true)}
            >
              <AlertTriangle />
              退回
            </Button>
          </div>
          <Button
            disabled={pending}
            onClick={() =>
              run(
                () => {
                  if (goals.some((goal) => goal.skipManagerScore === undefined)) {
                    throw new Error("请完成所有目标的隔级上级评分后再提交");
                  }
                  return submitAssessment("skip_manager_review", {
                    cycleId: cycle.id,
                    summary,
                    goals: goals.map((goal) => ({
                      id: goal.id,
                      score: goal.skipManagerScore,
                      comment: goal.skipManagerComment,
                    })),
                  });
                },
                cycle.requiresFinalReview ? "隔级评估已提交" : "评估已完成",
              )
            }
          >
            提交隔级评估
          </Button>
        </ReviewFooter>
      )}
      {cycle.stage === "hr_calibration" && detail.capabilities.calibrate && (
        <section className="rounded-md border bg-white p-4">
          <div className="mb-3 font-medium">HR校准</div>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="自动总分">
              <Input value={score === null ? "待完成上级评分" : score} readOnly />
            </Field>
            {cycle.kind === "probation" && (
              <Field label="最终评级">
                <Select value={rating} onValueChange={(value) => value && setRating(value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="请选择评级" />
                  </SelectTrigger>
                  <SelectContent>
                    {PERFORMANCE_RATINGS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-2 text-xs text-muted-foreground">
                  {PERFORMANCE_RATINGS.find((item) => item.value === rating)?.description ??
                    "评级独立选择，不按分数自动换算。"}
                </p>
              </Field>
            )}
            {cycle.kind !== "probation" && (
              <Field label="最终等级">
                <Input value={score === null ? "待完成上级评分" : gradeForScore(score)} readOnly />
              </Field>
            )}
            {cycle.kind === "probation" && cycle.requiresFinalReview && (
              <Field label="试用期结论">
                <Select
                  value={probationResult}
                  onValueChange={(value) => setProbationResult(value ?? "passed")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="passed">通过</SelectItem>
                    <SelectItem value="extended">延期</SelectItem>
                    <SelectItem value="failed">不通过</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>
          <Field label="校准意见">
            <Textarea value={comment} onChange={(event) => setComment(event.target.value)} />
          </Field>
          <div className="mt-3 flex justify-end gap-2">
            <Select
              value={returnStage}
              onValueChange={(value) => value && setReturnStage(value as typeof returnStage)}
            >
              <SelectTrigger className="w-[170px]">
                <SelectValue>
                  {(value) => STAGE_LABEL[value as keyof typeof STAGE_LABEL] ?? "选择退回环节"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="self_review">员工自评</SelectItem>
                <SelectItem value="manager_review">直属上级评估</SelectItem>
                {cycle.kind !== "probation" && cycle.skipManagerUserId && (
                  <SelectItem value="skip_manager_review">隔级上级评估</SelectItem>
                )}
              </SelectContent>
            </Select>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => setConfirmAssessmentReturn(true)}
            >
              <AlertTriangle />
              退回评估
            </Button>
            <Button
              disabled={pending || (cycle.kind === "probation" && !rating)}
              onClick={() =>
                run(
                  () =>
                    submitAssessment("calibrate", {
                      cycleId: cycle.id,
                      comment,
                      rating:
                        cycle.kind === "probation"
                          ? (rating as (typeof PERFORMANCE_RATINGS)[number]["value"])
                          : undefined,
                      probationResult:
                        cycle.kind === "probation" && cycle.requiresFinalReview
                          ? probationResult
                          : null,
                    }),
                  "校准结果已提交",
                )
              }
            >
              提交校准
            </Button>
          </div>
        </section>
      )}
      {cycle.stage === "employee_confirm" && isEmployee && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-6 rounded-md border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-950">
            <div>
              <div className="text-sm font-medium text-emerald-700">最终得分</div>
              <div className="mt-1 text-2xl font-semibold">
                {cycle.finalScore ?? "-"}
                {cycle.finalScore !== null && <span className="ml-1 text-base">分</span>}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-emerald-700">最终评级</div>
              <div className="mt-1 text-2xl font-semibold">{cycle.finalGrade ?? "-"}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-base font-semibold text-blue-900">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-blue-600 text-sm text-white">
              i
            </span>
            结果确认截止时间：{formatConfirmationDeadline(cycle.confirmationDeadline)}
          </div>
          <ActionBar>
            <span>
              请在截止时间前确认最终得分与评级；评级由 HR 校准后显示，逾期系统将自动确认。
            </span>
            <div>
              <Button
                disabled={pending}
                onClick={() =>
                  run(() => confirmPerformanceResult({ cycleId: cycle.id }), "考核结果已确认")
                }
              >
                确认结果
              </Button>
            </div>
          </ActionBar>
        </div>
      )}
      <ConfirmDialog
        open={confirmGoalReturn}
        onOpenChange={setConfirmGoalReturn}
        title="确认退回目标修改？"
        description="退回后，员工需要修改目标并重新提交审核。该操作会记录在变更记录中。"
        confirmText="确认退回"
        variant="danger"
        onConfirm={() =>
          run(() => reviewGoals({ cycleId: cycle.id, approved: false, comment }), "目标已退回")
        }
      />
      <ConfirmDialog
        open={confirmAssessmentReturn}
        onOpenChange={setConfirmAssessmentReturn}
        title={`确认退回到${STAGE_LABEL[returnStage]}？`}
        description="退回后，下游已经填写的评分、评语或校准结果将被清除，需要相关人员重新提交。该操作会记录在变更记录中。"
        confirmText="确认退回"
        variant="danger"
        onConfirm={performReturn}
      />
    </div>
  );
}

function ResultView({ cycle }: { cycle: PerformanceCycleView }) {
  const directTotal = calculateWeightedScore(
    cycle.goals.map((goal) => ({ weight: goal.weight, managerScore: goal.managerScore })),
  );
  const skipTotal = calculateWeightedScore(
    cycle.goals.map((goal) => ({ weight: goal.weight, managerScore: goal.skipManagerScore })),
  );
  return (
    <div className="rounded-md border bg-white p-6">
      <h3 className="text-base font-semibold">考核结果</h3>
      {cycle.finalGrade || cycle.finalScore !== null ? (
        <div className="mt-6 space-y-5">
          <Rating rating={cycle.finalGrade ?? "待HR评级"} score={cycle.finalScore} />
          <div
            className={`grid gap-3 ${cycle.kind !== "probation" && cycle.skipManagerUserId ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}
          >
            <div>
              <div className="text-xs text-muted-foreground">
                直接上级总分{cycle.kind !== "probation" && cycle.skipManagerUserId ? "（40%）" : ""}
              </div>
              <div className="mt-1 font-medium">{directTotal ?? "-"}</div>
            </div>
            {cycle.kind !== "probation" && cycle.skipManagerUserId && (
              <div>
                <div className="text-xs text-muted-foreground">隔级上级总分（60%）</div>
                <div className="mt-1 font-medium">{skipTotal ?? "-"}</div>
              </div>
            )}
          </div>
          {(cycle.requiresFinalReview || cycle.kind === "probation") && (
            <div>
              <div className="text-xs text-muted-foreground">HR校准意见</div>
              <div className="mt-1 whitespace-pre-wrap text-sm">{cycle.hrComment ?? "-"}</div>
            </div>
          )}
          {cycle.probationResult && (
            <div>
              <div className="text-xs text-muted-foreground">试用期结论</div>
              <div className="mt-1 font-medium">
                {{ passed: "通过", extended: "延期", failed: "不通过" }[cycle.probationResult] ??
                  cycle.probationResult}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-8 text-sm text-muted-foreground">当前尚未形成最终结果。</div>
      )}
    </div>
  );
}

function EventsView({
  detail,
  cycle,
}: {
  detail: PeoplePerformanceDetail;
  cycle: PerformanceCycleView;
}) {
  const events = detail.events.filter((event) => event.cycleId === cycle.id);
  return (
    <div className="rounded-md border bg-white divide-y">
      {events.length ? (
        events.map((event) => (
          <div key={event.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm font-medium">{event.eventType}</div>
              <time className="text-xs text-muted-foreground">
                {new Date(event.createdAt).toLocaleString("zh-CN")}
              </time>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              操作人：{event.actorName ?? "系统"}
              {event.fromStage && event.toStage
                ? ` · ${STAGE_LABEL[event.fromStage as keyof typeof STAGE_LABEL] ?? event.fromStage} → ${STAGE_LABEL[event.toStage as keyof typeof STAGE_LABEL] ?? event.toStage}`
                : ""}
            </div>
          </div>
        ))
      ) : (
        <div className="p-8 text-center text-sm text-muted-foreground">暂无变更记录</div>
      )}
    </div>
  );
}

function QuarterSummary({
  detail,
  cycle,
}: {
  detail: PeoplePerformanceDetail;
  cycle: PerformanceCycleView;
}) {
  const months = detail.cycles.filter((item) => item.parentCycleId === cycle.id);
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {months.map((month) => (
        <div key={month.id} className="rounded-md border bg-white p-4">
          <div className="font-medium">{month.label}</div>
          <div className="mt-3 text-2xl font-semibold">{month.finalScore ?? "-"}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            评级 {month.finalGrade ?? "-"} · {STAGE_LABEL[month.stage]}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusPill({
  status,
}: {
  status: PeoplePerformanceDetail["profile"]["employmentStatus"];
}) {
  const text =
    status === "probation"
      ? "试用期"
      : status === "regular"
        ? "正式"
        : status === "inactive"
          ? "停用"
          : "未配置";
  return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{text}</span>;
}
function Rating({ rating, score }: { rating: string; score: number | null }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid min-h-10 min-w-10 shrink-0 place-items-center rounded-md bg-blue-50 px-2 py-1 text-xl font-semibold text-blue-700">
        <span className="text-sm leading-5">{rating}</span>
      </span>
      <div>
        <div className="text-xs text-muted-foreground">最终得分</div>
        <div className="font-semibold">{score ?? "-"}</div>
      </div>
    </div>
  );
}

function formatConfirmationDeadline(value: string | null): string {
  if (!value) return "待计算";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(value))
    .replaceAll("/", "-");
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function ActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-md border bg-white/95 p-3 text-sm shadow-sm backdrop-blur">
      {children}
    </div>
  );
}
function ReviewFooter({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border bg-white p-4">
      <Field label={label}>
        <Textarea value={value} onChange={(event) => onChange(event.target.value)} />
      </Field>
      <div className="mt-3 flex justify-end">{children}</div>
    </section>
  );
}
