"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveRecruitmentDemand, type RecruitmentDemandRow } from "@/modules/business-recruitment";

export function DemandDialog({
  demand,
  onSaved,
}: {
  demand?: RecruitmentDemandRow;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(
    demand?.month.slice(0, 7) ?? new Date().toISOString().slice(0, 7),
  );
  const [category, setCategory] = useState(demand?.category ?? "游戏主播");
  const [project, setProject] = useState(demand?.project ?? "");
  const [target, setTarget] = useState(String(demand?.targetCount ?? 0));
  const [notes, setNotes] = useState(demand?.notes ?? "");
  const [pending, startSaving] = useTransition();

  const save = () => {
    startSaving(async () => {
      try {
        await saveRecruitmentDemand({
          id: demand?.id,
          month,
          category: category || null,
          project,
          targetCount: Number(target),
          notes: notes || null,
        });
        toast.success("招聘需求已保存");
        setOpen(false);
        onSaved();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存失败");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant={demand ? "ghost" : "default"} />}>
        {demand ? (
          "编辑"
        ) : (
          <>
            <Plus /> 新增需求
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{demand ? "编辑招聘需求" : "新增招聘需求"}</DialogTitle>
          <DialogDescription>到岗和试播通过数量会根据候选人流程自动计算。</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <Field label="月份">
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </Field>
          <Field label="类别">
            <Input value={category} onChange={(e) => setCategory(e.target.value)} />
          </Field>
          <div className="col-span-2">
            <Field label="项目">
              <Input value={project} onChange={(e) => setProject(e.target.value)} />
            </Field>
          </div>
          <Field label="目标人数">
            <Input
              type="number"
              min="0"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </Field>
          <div className="col-span-2">
            <Field label="说明">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button disabled={pending || !project || !month} onClick={save}>
            {pending && <LoaderCircle className="animate-spin" />} 保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
