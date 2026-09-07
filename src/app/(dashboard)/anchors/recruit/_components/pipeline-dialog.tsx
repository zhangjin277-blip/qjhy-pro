"use client";

import { useMemo, useState, useTransition } from "react";
import { LoaderCircle, Pencil, Plus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  savePipelineApplication,
  type RecruitmentApplicationRow,
} from "@/modules/business-recruitment";

interface Staff {
  userId: string;
  name: string;
}

export function PipelineDialog({
  application,
  staff,
  products,
  onSaved,
}: {
  application?: RecruitmentApplicationRow;
  staff: Staff[];
  products: string[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [candidateName, setCandidateName] = useState(application?.candidateName ?? "");
  const [phone, setPhone] = useState(application?.phone ?? "");
  const [project, setProject] = useState(application?.project ?? "");
  const [channel, setChannel] = useState(application?.channel ?? "BOSS");
  const [recruiterUserId, setRecruiterUserId] = useState(application?.recruiterUserId ?? "none");
  const [invitedDate, setInvitedDate] = useState(application?.invitedDate ?? today());
  const [interviewDate, setInterviewDate] = useState(application?.interviewDate ?? "");
  const [interviewTime, setInterviewTime] = useState(application?.interviewTime?.slice(0, 5) ?? "");
  const [attendanceStatus, setAttendanceStatus] = useState(
    application?.attendanceStatus ?? "pending",
  );
  const [initialResult, setInitialResult] = useState(application?.initialResult ?? "pending");
  const [finalResult, setFinalResult] = useState(application?.finalResult ?? "pending");
  const [offerStatus, setOfferStatus] = useState(application?.offerStatus ?? "pending");
  const [expectedJoinDate, setExpectedJoinDate] = useState(application?.expectedJoinDate ?? "");
  const [actualJoinDate, setActualJoinDate] = useState(application?.actualJoinDate ?? "");
  const [trialResult, setTrialResult] = useState(application?.trialResult ?? "pending");
  const [trialDate, setTrialDate] = useState(application?.trialDate ?? "");
  const [mentorUserId, setMentorUserId] = useState(application?.mentorUserId ?? "none");
  const [contractStatus, setContractStatus] = useState(application?.contractStatus ?? "pending");
  const [leaveDate, setLeaveDate] = useState(application?.leaveDate ?? "");
  const [leaveReason, setLeaveReason] = useState(application?.leaveReason ?? "");
  const [notes, setNotes] = useState(application?.notes ?? "");
  const [pending, startSaving] = useTransition();
  const staffNames = useMemo(
    () => new Map(staff.map((person) => [person.userId, person.name])),
    [staff],
  );

  const save = () => {
    startSaving(async () => {
      try {
        await savePipelineApplication({
          id: application?.id,
          candidateName,
          phone: phone || null,
          project: project || null,
          channel,
          recruiterUserId: recruiterUserId === "none" ? null : recruiterUserId,
          recruiterNameSnapshot:
            recruiterUserId === "none"
              ? (application?.recruiterName ?? null)
              : (staffNames.get(recruiterUserId) ?? null),
          invitedDate,
          interviewDate: interviewDate || null,
          interviewTime: interviewTime || null,
          attendanceStatus,
          initialResult,
          finalResult,
          offerStatus,
          expectedJoinDate: expectedJoinDate || null,
          actualJoinDate: actualJoinDate || null,
          trialResult,
          trialDate: trialDate || null,
          mentorUserId: mentorUserId === "none" ? null : mentorUserId,
          mentorNameSnapshot:
            mentorUserId === "none"
              ? (application?.mentorName ?? null)
              : (staffNames.get(mentorUserId) ?? null),
          contractStatus,
          leaveDate: leaveDate || null,
          leaveReason: leaveReason || null,
          notes: notes || null,
        });
        toast.success(application ? "候选人流程已更新" : "候选人已登记");
        setOpen(false);
        onSaved();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存失败");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size={application ? "icon-sm" : "sm"}
            variant={application ? "ghost" : "default"}
            aria-label={application ? `编辑${application.candidateName}` : undefined}
          />
        }
      >
        {application ? (
          <Pencil />
        ) : (
          <>
            <Plus /> 新增候选人
          </>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {application ? `编辑 · ${application.candidateName}` : "新增候选人"}
          </DialogTitle>
          <DialogDescription>填写当前已知信息，流程阶段会根据结果自动推导。</DialogDescription>
        </DialogHeader>

        <FormBand title="邀约信息">
          <Field label="候选人姓名">
            <Input value={candidateName} onChange={(e) => setCandidateName(e.target.value)} />
          </Field>
          <Field label="联系电话">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="应聘项目">
            <Select value={project || null} onValueChange={(value) => setProject(value ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择项目" />
              </SelectTrigger>
              <SelectContent>
                {products.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="招聘渠道">
            <Input value={channel} onChange={(e) => setChannel(e.target.value)} />
          </Field>
          <Field label="招聘人员">
            <StaffSelect value={recruiterUserId} staff={staff} onChange={setRecruiterUserId} />
          </Field>
          <Field label="邀约日期">
            <Input
              type="date"
              value={invitedDate}
              onChange={(e) => setInvitedDate(e.target.value)}
            />
          </Field>
        </FormBand>

        <FormBand title="面试与 Offer">
          <Field label="面试日期">
            <Input
              type="date"
              value={interviewDate}
              onChange={(e) => setInterviewDate(e.target.value)}
            />
          </Field>
          <Field label="面试时间">
            <Input
              type="time"
              value={interviewTime}
              onChange={(e) => setInterviewTime(e.target.value)}
            />
          </Field>
          <Field label="到面状态">
            <StatusSelect
              value={attendanceStatus}
              onChange={setAttendanceStatus}
              options={{ pending: "待到面", attended: "已到面", no_show: "未到面" }}
            />
          </Field>
          <Field label="初面结果">
            <StatusSelect
              value={initialResult}
              onChange={setInitialResult}
              options={RESULT_OPTIONS}
            />
          </Field>
          <Field label="终面结果">
            <StatusSelect value={finalResult} onChange={setFinalResult} options={RESULT_OPTIONS} />
          </Field>
          <Field label="Offer">
            <StatusSelect
              value={offerStatus}
              onChange={setOfferStatus}
              options={{ pending: "未发送", sent: "已发送", declined: "已拒绝" }}
            />
          </Field>
        </FormBand>

        <FormBand title="到岗与留存">
          <Field label="预计到岗">
            <Input
              type="date"
              value={expectedJoinDate}
              onChange={(e) => setExpectedJoinDate(e.target.value)}
            />
          </Field>
          <Field label="实际到岗">
            <Input
              type="date"
              value={actualJoinDate}
              onChange={(e) => setActualJoinDate(e.target.value)}
            />
          </Field>
          <Field label="试播结果">
            <StatusSelect value={trialResult} onChange={setTrialResult} options={RESULT_OPTIONS} />
          </Field>
          <Field label="试播日期">
            <Input type="date" value={trialDate} onChange={(e) => setTrialDate(e.target.value)} />
          </Field>
          <Field label="带教运营">
            <StaffSelect value={mentorUserId} staff={staff} onChange={setMentorUserId} />
          </Field>
          <Field label="合同">
            <StatusSelect
              value={contractStatus}
              onChange={setContractStatus}
              options={{ pending: "待签", signed: "已签", declined: "不签" }}
            />
          </Field>
          <Field label="离职日期">
            <Input type="date" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="离职原因">
              <Input value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-3">
            <Field label="备注">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </FormBand>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button disabled={pending || !candidateName || !invitedDate || !channel} onClick={save}>
            {pending && <LoaderCircle className="animate-spin" />} 保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const RESULT_OPTIONS = { pending: "待处理", pass: "通过", fail: "未通过" };

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
}

function FormBand({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t pt-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-3">{children}</div>
    </section>
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

function StaffSelect({
  value,
  staff,
  onChange,
}: {
  value: string;
  staff: Staff[];
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = staff.filter((person) =>
    person.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <div className="space-y-1">
      <Input
        placeholder="搜索姓名"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <Select value={value} onValueChange={(next) => onChange(next ?? "none")}>
        <SelectTrigger className="w-full">
          <SelectValue>
            {(selected) =>
              selected && selected !== "none"
                ? (staff.find((person) => person.userId === selected)?.name ?? "未分配")
                : "未分配"
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">未分配</SelectItem>
          {filtered.map((person) => (
            <SelectItem key={person.userId} value={person.userId}>
              {person.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function StatusSelect<const T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange((next ?? value) as T)}>
      <SelectTrigger className="w-full">
        <SelectValue>
          {(selected) => {
            const key = selected as T | undefined;
            return key ? options[key] : "请选择";
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(Object.entries(options) as [string, string][]).map(([key, label]) => (
          <SelectItem key={key} value={key}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
