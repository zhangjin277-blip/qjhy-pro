"use client";

import { useState, useTransition } from "react";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  bulkConfigurePeopleProfiles,
  type PeopleListRow,
  type PerformanceManagerOption,
} from "@/modules/people-performance";

import { ManagerCombobox } from "./manager-combobox";

interface GoalDraft {
  title: string;
  description: string;
  targetValue: string;
  weight: number;
}

const EMPTY_GOAL: GoalDraft = { title: "", description: "", targetValue: "", weight: 100 };

export function BulkProfileDialog({
  selectedRows,
  managers,
  open,
  onOpenChange,
  onCompleted,
}: {
  selectedRows: PeopleListRow[];
  managers: PerformanceManagerOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => void;
}) {
  const router = useRouter();
  const [managerUserId, setManagerUserId] = useState<string | null>(null);
  const [skipManagerUserId, setSkipManagerUserId] = useState<string | null>(null);
  const [employmentStatus, setEmploymentStatus] = useState<"probation" | "regular">("probation");
  const [probationMonths, setProbationMonths] = useState<2 | 3 | 6>(2);
  const [applyProbationGoals, setApplyProbationGoals] = useState(false);
  const [applyPerformanceGoals, setApplyPerformanceGoals] = useState(false);
  const [probationGoals, setProbationGoals] = useState<GoalDraft[]>([{ ...EMPTY_GOAL }]);
  const [performanceGoals, setPerformanceGoals] = useState<GoalDraft[]>([{ ...EMPTY_GOAL }]);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!managerUserId) {
      toast.error("请选择直接上级");
      return;
    }
    if (applyProbationGoals && !goalsAreValid(probationGoals)) {
      toast.error("试用期目标需填写完整，且权重合计为100%");
      return;
    }
    if (applyPerformanceGoals && !goalsAreValid(performanceGoals)) {
      toast.error("绩效目标需填写完整，且权重合计为100%");
      return;
    }
    startTransition(async () => {
      try {
        const result = await bulkConfigurePeopleProfiles({
          userIds: selectedRows.map((row) => row.userId),
          managerUserId,
          skipManagerUserId,
          employmentStatus,
          probationMonths,
          applyProbationGoals,
          probationGoals: applyProbationGoals ? toGoalTemplates(probationGoals) : [],
          applyPerformanceGoals,
          performanceGoals: applyPerformanceGoals ? toGoalTemplates(performanceGoals) : [],
        });
        if (result.failed.length > 0) {
          toast.warning(
            `已配置${result.configured}人，${result.failed.length}人失败：${result.failed.map((item) => `${item.name}（${item.reason}）`).join("、")}`,
            { duration: 8000 },
          );
        } else {
          toast.success(`已完成${result.configured}人的批量配置`);
        }
        router.refresh();
        onCompleted();
        onOpenChange(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "批量配置失败");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[900px]">
        <DialogHeader>
          <DialogTitle>批量配置人员档案</DialogTitle>
          <DialogDescription>
            已选择{selectedRows.length}人。入职日期沿用已有档案，未配置人员从钉钉花名册读取。
          </DialogDescription>
        </DialogHeader>

        <section className="grid gap-3 rounded-md border bg-slate-50 p-3 md:grid-cols-4">
          <Field label="直接上级（必填）">
            <ManagerCombobox
              managers={managers}
              value={managerUserId}
              placeholder="搜索并选择"
              onValueChange={setManagerUserId}
            />
          </Field>
          <Field label="隔级上级（可不配置）">
            <ManagerCombobox
              managers={managers}
              value={skipManagerUserId}
              placeholder="不配置隔级上级"
              allowClear
              onValueChange={setSkipManagerUserId}
            />
          </Field>
          <Field label="人员状态">
            <Select
              value={employmentStatus}
              onValueChange={(value) =>
                value && setEmploymentStatus(value as "probation" | "regular")
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="probation">试用期</SelectItem>
                <SelectItem value="regular">正式</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="试用期时长">
            <Select
              value={String(probationMonths)}
              onValueChange={(value) =>
                setProbationMonths(value === "6" ? 6 : value === "3" ? 3 : 2)
              }
              disabled={employmentStatus !== "probation"}
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
          {managerUserId && managerUserId === skipManagerUserId && (
            <div className="col-span-full text-xs text-muted-foreground">
              直接上级与隔级上级已配置为同一人，系统会按两个环节分别处理正式绩效评估。
            </div>
          )}
        </section>

        <GoalTemplateSection
          title="试用期目标"
          checked={applyProbationGoals}
          onCheckedChange={setApplyProbationGoals}
          goals={probationGoals}
          onGoalsChange={setProbationGoals}
        />
        <GoalTemplateSection
          title="正式绩效目标"
          checked={applyPerformanceGoals}
          onCheckedChange={setApplyPerformanceGoals}
          goals={performanceGoals}
          onGoalsChange={setPerformanceGoals}
        />

        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            disabled={pending || selectedRows.length === 0 || !managerUserId}
            onClick={submit}
          >
            <Settings2 />
            {pending ? "配置中..." : `配置${selectedRows.length}人`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GoalTemplateSection({
  title,
  checked,
  onCheckedChange,
  goals,
  onGoalsChange,
}: {
  title: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  goals: GoalDraft[];
  onGoalsChange: (goals: GoalDraft[]) => void;
}) {
  const total = goals.reduce((sum, goal) => sum + goal.weight, 0);
  const updateGoal = (index: number, patch: Partial<GoalDraft>) =>
    onGoalsChange(
      goals.map((goal, itemIndex) => (itemIndex === index ? { ...goal, ...patch } : goal)),
    );
  return (
    <section className="rounded-md border">
      <div className="flex items-center justify-between border-b bg-slate-50 px-3 py-2.5">
        <label className="flex cursor-pointer items-center gap-2 font-medium">
          <input
            type="checkbox"
            className="size-4 accent-blue-600"
            checked={checked}
            onChange={(event) => onCheckedChange(event.target.checked)}
          />
          同步配置{title}
        </label>
        {checked && (
          <span className={total === 100 ? "text-xs text-emerald-700" : "text-xs text-red-600"}>
            权重合计：{total}%
          </span>
        )}
      </div>
      {checked && (
        <div className="space-y-3 p-3">
          {goals.map((goal, index) => (
            <div
              key={index}
              className="grid gap-2 border-b pb-3 last:border-0 last:pb-0 md:grid-cols-[1.2fr_90px_1.5fr_1.5fr_32px]"
            >
              <Input
                placeholder="目标名称"
                value={goal.title}
                onChange={(event) => updateGoal(index, { title: event.target.value })}
              />
              <Input
                type="number"
                min={1}
                max={100}
                placeholder="权重"
                value={goal.weight}
                onChange={(event) => updateGoal(index, { weight: Number(event.target.value) })}
              />
              <Textarea
                className="min-h-8"
                placeholder="目标说明"
                value={goal.description}
                onChange={(event) => updateGoal(index, { description: event.target.value })}
              />
              <Textarea
                className="min-h-8"
                placeholder="衡量标准 / 目标值"
                value={goal.targetValue}
                onChange={(event) => updateGoal(index, { targetValue: event.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={goals.length === 1}
                aria-label="删除目标"
                onClick={() => onGoalsChange(goals.filter((_, itemIndex) => itemIndex !== index))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onGoalsChange([...goals, { ...EMPTY_GOAL, weight: 0 }])}
          >
            <Plus />
            新增目标
          </Button>
        </div>
      )}
    </section>
  );
}

function goalsAreValid(goals: GoalDraft[]): boolean {
  return (
    goals.length > 0 &&
    goals.every((goal) => goal.title.trim() && goal.weight > 0) &&
    Math.abs(goals.reduce((sum, goal) => sum + goal.weight, 0) - 100) < 0.01
  );
}

function toGoalTemplates(goals: GoalDraft[]) {
  return goals.map((goal) => ({
    title: goal.title.trim(),
    description: goal.description.trim(),
    metric: goal.targetValue.trim(),
    targetValue: goal.targetValue.trim(),
    weight: goal.weight,
  }));
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
