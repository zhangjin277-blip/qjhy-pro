"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Check, ClipboardList, Clock3, LoaderCircle, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
  getRecruitmentCandidateDetailAction,
  deleteRecruitmentCandidate,
  recommendRecruitmentGrade,
  saveRecruitmentBase,
  saveRecruitmentBusinessReview,
  saveRecruitmentOnboarding,
  saveRecruitmentOperationReview,
  type RecruitmentCandidateDetail,
  type RecruitmentCapabilities,
  type RecruitmentStatus,
} from "@/modules/business-recruitment";

const STEPS = ["基础资料", "商务初评", "运营复评", "入会签约"] as const;

const STATUS_STEP: Record<RecruitmentStatus, number> = {
  draft: 0,
  business_review: 1,
  operation_review: 2,
  signing: 3,
  signed: 3,
  live: 3,
  rejected: 3,
  abnormal: 3,
};

const EVENT_LABEL: Record<string, string> = {
  candidate_created: "创建候选人",
  base_saved: "更新基础资料",
  business_review_saved: "完成商务初评",
  operation_review_saved: "完成运营复评",
  onboarding_saved: "更新入会签约信息",
};

const GENDER_LABEL = { unspecified: "未填写", female: "女", male: "男" } as const;
const PLATFORM_LABEL = { douyin: "抖音", kuaishou: "快手", other: "其他" } as const;
const EQUIPMENT_LABEL = {
  ready: "声卡 + 电脑，已达标",
  partial: "部分具备，待补充",
  missing: "未达标",
} as const;
const WILLINGNESS_LABEL = {
  strong: "强，愿意配合运营",
  medium: "一般，需继续沟通",
  weak: "弱",
} as const;
const SIGNING_LABEL = {
  pending: "待签约",
  signed: "已签约",
  declined: "不签约",
  abnormal: "主播异常",
} as const;

interface StaffOption {
  userId: string;
  name: string;
}

export function RecruitmentDrawer({
  candidateId,
  products,
  staff,
  capabilities,
  refreshing,
  onSaved,
  onClose,
}: {
  candidateId: string | null;
  products: string[];
  staff: StaffOption[];
  capabilities: RecruitmentCapabilities;
  refreshing: boolean;
  onSaved: (focusId?: string) => void;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<RecruitmentCandidateDetail | null>(null);
  const [currentId, setCurrentId] = useState(candidateId);
  const [activeStep, setActiveStep] = useState(0);
  const [loading, startLoading] = useTransition();

  const loadDetail = useCallback(
    (id: string) => {
      startLoading(async () => {
        try {
          const next = await getRecruitmentCandidateDetailAction({ id });
          setDetail(next);
          setCurrentId(id);
          setActiveStep(STATUS_STEP[next.status]);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "加载失败");
        }
      });
    },
    [startLoading],
  );

  useEffect(() => {
    if (candidateId) loadDetail(candidateId);
    else {
      setDetail(null);
      setCurrentId(null);
      setActiveStep(0);
    }
  }, [candidateId, loadDetail]);

  const refreshDetail = (id: string, nextStep?: number) => {
    startLoading(async () => {
      try {
        const next = await getRecruitmentCandidateDetailAction({ id });
        setDetail(next);
        setCurrentId(id);
        setActiveStep(nextStep ?? STATUS_STEP[next.status]);
        onSaved(id);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "刷新失败");
      }
    });
  };

  const title = detail ? detail.anchorName : "新增主播登记";
  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <header className="shrink-0 border-b px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-foreground">{title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {detail
                ? `${detail.accountNickname} · ${detail.accountId}`
                : "先登记最少必要信息，后续按流程补全"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {detail && capabilities.canEditCandidate && (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={loading || refreshing}
                onClick={() => {
                  if (!window.confirm(`确定删除“${detail.anchorName}”的登记吗？删除后不可恢复。`))
                    return;
                  startLoading(async () => {
                    const result = await deleteRecruitmentCandidate({ id: detail.id });
                    if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                    toast.success("登记已删除");
                    onClose();
                    onSaved();
                  });
                }}
              >
                <Trash2 />
                删除
              </Button>
            )}
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={onClose}
              aria-label="关闭"
            >
              <X />
            </Button>
          </div>
        </div>
      </header>

      <Tabs defaultValue="workflow" className="min-h-0 flex-1 gap-0">
        {detail && (
          <div className="shrink-0 border-b px-5">
            <TabsList variant="line" className="h-10">
              <TabsTrigger value="workflow">
                <ClipboardList />
                流程资料
              </TabsTrigger>
              <TabsTrigger value="history">
                <Clock3 />
                跟进记录 {detail.events.length}
              </TabsTrigger>
            </TabsList>
          </div>
        )}
        <TabsContent value="workflow" className="min-h-0 overflow-y-auto">
          <div className="px-5 py-5">
            <StepNavigation
              activeStep={activeStep}
              statusStep={detail ? STATUS_STEP[detail.status] : 0}
              onChange={setActiveStep}
            />
            {loading && !detail && currentId ? (
              <div className="grid min-h-60 place-items-center text-sm text-muted-foreground">
                <LoaderCircle className="size-5 animate-spin" />
              </div>
            ) : (
              <div className="mt-6">
                {activeStep === 0 && (
                  <BaseForm
                    key={`base-${currentId ?? "new"}`}
                    detail={detail}
                    products={products}
                    disabled={!capabilities.canEditCandidate}
                    pending={loading || refreshing}
                    onSaved={(id, advance) => {
                      setCurrentId(id);
                      refreshDetail(id, advance ? 1 : 0);
                    }}
                  />
                )}
                {activeStep === 1 && currentId && (
                  <BusinessReviewForm
                    key={`business-${currentId}-${detail?.updatedAt ?? ""}`}
                    id={currentId}
                    detail={detail}
                    staff={staff}
                    disabled={!capabilities.canEditCandidate}
                    pending={loading || refreshing}
                    onSaved={(advance) => refreshDetail(currentId, advance ? 2 : 1)}
                  />
                )}
                {activeStep === 2 && currentId && (
                  <OperationReviewForm
                    key={`operation-${currentId}-${detail?.updatedAt ?? ""}`}
                    id={currentId}
                    detail={detail}
                    disabled={!capabilities.canReviewOperation}
                    pending={loading || refreshing}
                    onSaved={(advance) => refreshDetail(currentId, advance ? 3 : 2)}
                  />
                )}
                {activeStep === 3 && currentId && (
                  <OnboardingForm
                    key={`onboarding-${currentId}-${detail?.updatedAt ?? ""}`}
                    id={currentId}
                    detail={detail}
                    disabled={!capabilities.canManageSigning}
                    pending={loading || refreshing}
                    onSaved={() => refreshDetail(currentId, 3)}
                  />
                )}
                {activeStep > 0 && !currentId && (
                  <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                    请先保存基础资料
                  </div>
                )}
              </div>
            )}
          </div>
        </TabsContent>
        {detail && (
          <TabsContent value="history" className="min-h-0 overflow-y-auto p-5">
            <EventTimeline detail={detail} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function StepNavigation({
  activeStep,
  statusStep,
  onChange,
}: {
  activeStep: number;
  statusStep: number;
  onChange: (step: number) => void;
}) {
  return (
    <div className="grid grid-cols-4" aria-label="登记阶段">
      {STEPS.map((label, index) => {
        const done = index < statusStep;
        const active = index === activeStep;
        return (
          <button
            key={label}
            type="button"
            onClick={() => onChange(index)}
            className={`relative min-h-14 px-1 pt-7 text-xs transition-colors before:absolute before:top-2.5 before:left-0 before:h-0.5 before:w-full before:bg-border after:absolute after:top-1 after:left-1/2 after:size-3 after:-translate-x-1/2 after:rounded-full after:bg-border after:ring-4 after:ring-card ${
              done
                ? "text-primary before:bg-primary after:bg-primary"
                : active
                  ? "font-medium text-primary after:bg-primary"
                  : "text-muted-foreground"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function BaseForm({
  detail,
  products,
  disabled,
  pending,
  onSaved,
}: {
  detail: RecruitmentCandidateDetail | null;
  products: string[];
  disabled: boolean;
  pending: boolean;
  onSaved: (id: string, advance: boolean) => void;
}) {
  const [platform, setPlatform] = useState(detail?.platform ?? "douyin");
  const [gameProduct, setGameProduct] = useState(detail?.gameProduct ?? products[0] ?? "");
  const [anchorName, setAnchorName] = useState(detail?.anchorName ?? "");
  const [gender, setGender] = useState(detail?.gender ?? "unspecified");
  const [phone, setPhone] = useState(detail?.phone ?? "");
  const [accountNickname, setAccountNickname] = useState(detail?.accountNickname ?? "");
  const [accountId, setAccountId] = useState(detail?.accountId ?? "");
  const [uid, setUid] = useState(detail?.uid ?? "");
  const [followerCount, setFollowerCount] = useState(String(detail?.followerCount ?? 0));
  const [accountSummary, setAccountSummary] = useState(detail?.accountSummary ?? "");
  const [saving, startSaving] = useTransition();

  const submit = (advance: boolean) => {
    startSaving(async () => {
      try {
        const result = await saveRecruitmentBase({
          id: detail?.id,
          platform,
          gameProduct,
          anchorName,
          gender,
          phone,
          accountNickname,
          accountId,
          uid: uid || null,
          followerCount: Number(followerCount.replaceAll(",", "")) || 0,
          accountSummary: accountSummary || null,
          advance,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(advance ? "基础资料已保存" : "草稿已保存");
        onSaved(result.id, advance);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存失败");
      }
    });
  };

  return (
    <div className="space-y-6">
      <FormSection title="身份与联系">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="主播姓名" required>
            <Input
              value={anchorName}
              onChange={(event) => setAnchorName(event.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field label="联系电话" required>
            <Input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field label="性别">
            <Select
              value={gender}
              onValueChange={(value) => setGender(value ?? "unspecified")}
              disabled={disabled}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value: string | null) =>
                    value ? GENDER_LABEL[value as keyof typeof GENDER_LABEL] : "未填写"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unspecified">未填写</SelectItem>
                <SelectItem value="female">女</SelectItem>
                <SelectItem value="male">男</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="游戏产品" required>
            <Select
              value={gameProduct || null}
              onValueChange={(value) => setGameProduct(value ?? "")}
              disabled={disabled}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择产品" />
              </SelectTrigger>
              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product} value={product}>
                    {product}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </FormSection>
      <FormSection title="平台账号">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="直播平台" required>
            <Select
              value={platform}
              onValueChange={(value) => setPlatform(value ?? "douyin")}
              disabled={disabled}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value: string | null) =>
                    value ? PLATFORM_LABEL[value as keyof typeof PLATFORM_LABEL] : "选择平台"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="douyin">抖音</SelectItem>
                <SelectItem value="kuaishou">快手</SelectItem>
                <SelectItem value="other">其他</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="账号昵称" required>
            <Input
              value={accountNickname}
              onChange={(event) => setAccountNickname(event.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field label="账号 ID" required>
            <Input
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field label="UID">
            <Input
              value={uid}
              onChange={(event) => setUid(event.target.value)}
              placeholder="选填"
              disabled={disabled}
            />
          </Field>
          <Field label="粉丝数">
            <Input
              type="number"
              min={0}
              value={followerCount}
              onChange={(event) => setFollowerCount(event.target.value)}
              disabled={disabled}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="账号基础情况">
              <Textarea
                value={accountSummary}
                onChange={(event) => setAccountSummary(event.target.value)}
                placeholder="内容方向、直播经历、历史数据等"
                rows={4}
                disabled={disabled}
              />
            </Field>
          </div>
        </div>
      </FormSection>
      {!disabled && (
        <FormActions
          pending={saving || pending}
          onDraft={() => submit(false)}
          onAdvance={() => submit(true)}
        />
      )}
    </div>
  );
}

function BusinessReviewForm({
  id,
  detail,
  staff,
  disabled,
  pending,
  onSaved,
}: {
  id: string;
  detail: RecruitmentCandidateDetail | null;
  staff: StaffOption[];
  disabled: boolean;
  pending: boolean;
  onSaved: (advance: boolean) => void;
}) {
  const [equipmentStatus, setEquipmentStatus] = useState(detail?.equipmentStatus ?? "ready");
  const [willingness, setWillingness] = useState(detail?.willingness ?? "strong");
  const [policy, setPolicy] = useState(detail?.policy ?? "");
  const [operatorUserId, setOperatorUserId] = useState(detail?.operatorUserId ?? "");
  const [checks, setChecks] = useState({
    appearancePass: detail?.appearancePass ?? false,
    voicePass: detail?.voicePass ?? false,
    expressionPass: detail?.expressionPass ?? false,
    internetSensePass: detail?.internetSensePass ?? false,
    resiliencePass: detail?.resiliencePass ?? false,
  });
  const [notes, setNotes] = useState({
    appearanceNote: detail?.appearanceNote ?? "",
    voiceNote: detail?.voiceNote ?? "",
    expressionNote: detail?.expressionNote ?? "",
    internetSenseNote: detail?.internetSenseNote ?? "",
    resilienceNote: detail?.resilienceNote ?? "",
  });
  const [saving, startSaving] = useTransition();
  const passCount = Object.values(checks).filter(Boolean).length;
  const grade = recommendRecruitmentGrade(passCount);
  const items = [
    ["appearancePass", "appearanceNote", "外貌记忆"],
    ["voicePass", "voiceNote", "声色表现"],
    ["expressionPass", "expressionNote", "口条表达"],
    ["internetSensePass", "internetSenseNote", "网感可塑"],
    ["resiliencePass", "resilienceNote", "心态抗压"],
  ] as const;

  const submit = (advance: boolean) => {
    startSaving(async () => {
      try {
        await saveRecruitmentBusinessReview({
          id,
          equipmentStatus,
          willingness,
          policy: policy || null,
          ...checks,
          operatorUserId: operatorUserId || null,
          ...Object.fromEntries(Object.entries(notes).map(([key, value]) => [key, value || null])),
          advance,
        });
        toast.success(advance ? "已提交运营复评" : "商务初评已保存");
        onSaved(advance);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存失败");
      }
    });
  };

  return (
    <div className="space-y-6">
      <FormSection title="准入门槛">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="直播设备">
            <Select
              value={equipmentStatus}
              onValueChange={(value) => setEquipmentStatus(value ?? "ready")}
              disabled={disabled}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value: string | null) =>
                    value ? EQUIPMENT_LABEL[value as keyof typeof EQUIPMENT_LABEL] : "选择设备情况"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ready">声卡 + 电脑，已达标</SelectItem>
                <SelectItem value="partial">部分具备，待补充</SelectItem>
                <SelectItem value="missing">未达标</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="开播意愿">
            <Select
              value={willingness}
              onValueChange={(value) => setWillingness(value ?? "strong")}
              disabled={disabled}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value: string | null) =>
                    value
                      ? WILLINGNESS_LABEL[value as keyof typeof WILLINGNESS_LABEL]
                      : "选择开播意愿"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="strong">强，愿意配合运营</SelectItem>
                <SelectItem value="medium">一般，需继续沟通</SelectItem>
                <SelectItem value="weak">弱</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="带教运营">
              <StaffPicker
                value={operatorUserId}
                staff={staff}
                onChange={setOperatorUserId}
                disabled={disabled}
              />
            </Field>
            <Field label="招募政策">
              <Textarea
                value={policy}
                onChange={(event) => setPolicy(event.target.value)}
                rows={3}
                disabled={disabled}
              />
            </Field>
          </div>
        </div>
      </FormSection>
      <FormSection title="五维初评">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map(([checkKey, noteKey, label]) => (
            <div key={checkKey} className="space-y-2 rounded-md border bg-muted/20 p-3">
              <label className="flex min-h-7 items-center gap-3 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={checks[checkKey]}
                  onChange={(event) =>
                    setChecks((current) => ({ ...current, [checkKey]: event.target.checked }))
                  }
                  disabled={disabled}
                  className="size-4 accent-primary"
                />
                {label}
              </label>
              <Input
                value={notes[noteKey]}
                onChange={(event) =>
                  setNotes((current) => ({ ...current, [noteKey]: event.target.value }))
                }
                placeholder="选填说明"
                maxLength={500}
                disabled={disabled}
              />
            </div>
          ))}
        </div>
        <div className="mt-3 border-l-2 border-primary bg-blue-50 px-3 py-2 text-sm text-blue-700">
          已符合 {passCount} 项，系统建议：{grade} 类候选人
        </div>
      </FormSection>
      {!disabled && (
        <FormActions
          pending={saving || pending}
          onDraft={() => submit(false)}
          onAdvance={() => submit(true)}
        />
      )}
    </div>
  );
}

function OperationReviewForm({
  id,
  detail,
  disabled,
  pending,
  onSaved,
}: {
  id: string;
  detail: RecruitmentCandidateDetail | null;
  disabled: boolean;
  pending: boolean;
  onSaved: (advance: boolean) => void;
}) {
  const [reviewCount, setReviewCount] = useState(
    String(detail?.operationReviewCount ?? detail?.businessReviewCount ?? 0),
  );
  const [finalGrade, setFinalGrade] = useState(detail?.finalGrade ?? detail?.suggestedGrade ?? "C");
  const [feedback, setFeedback] = useState(detail?.operationFeedback ?? "");
  const [saving, startSaving] = useTransition();

  const submit = (advance: boolean) => {
    startSaving(async () => {
      try {
        await saveRecruitmentOperationReview({
          id,
          operationReviewCount: Number(reviewCount),
          finalGrade,
          operationFeedback: feedback,
          advance,
        });
        toast.success(advance ? "运营复评已完成" : "运营复评已保存");
        onSaved(advance);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存失败");
      }
    });
  };

  return (
    <div className="space-y-6">
      <FormSection title="运营试播复评">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="复评符合项数" required>
            <Input
              type="number"
              min={0}
              max={5}
              value={reviewCount}
              onChange={(event) => setReviewCount(event.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field label="最终主播评级" required>
            <Select
              value={finalGrade}
              onValueChange={(value) => setFinalGrade(value ?? "C")}
              disabled={disabled}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value: string | null) => (value ? `${value} 类` : "选择评级")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A">A 类 · 资深运营带教</SelectItem>
                <SelectItem value="B">B 类 · 普通运营带教</SelectItem>
                <SelectItem value="C">C 类 · 实习带教或不推荐</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="运营反馈" required>
              <Textarea
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                rows={6}
                placeholder="试播表现、配合度、培养建议等"
                disabled={disabled}
              />
            </Field>
          </div>
        </div>
      </FormSection>
      {!disabled && (
        <FormActions
          pending={saving || pending}
          onDraft={() => submit(false)}
          onAdvance={() => submit(true)}
        />
      )}
    </div>
  );
}

function OnboardingForm({
  id,
  detail,
  disabled,
  pending,
  onSaved,
}: {
  id: string;
  detail: RecruitmentCandidateDetail | null;
  disabled: boolean;
  pending: boolean;
  onSaved: () => void;
}) {
  const [joinDate, setJoinDate] = useState(detail?.joinDate ?? "");
  const [firstLiveDate, setFirstLiveDate] = useState(detail?.firstLiveDate ?? "");
  const [signingStatus, setSigningStatus] = useState(detail?.signingStatus ?? "pending");
  const [abnormalNote, setAbnormalNote] = useState(detail?.abnormalNote ?? "");
  const [saving, startSaving] = useTransition();
  const submit = () => {
    startSaving(async () => {
      try {
        await saveRecruitmentOnboarding({
          id,
          joinDate: joinDate || null,
          firstLiveDate: firstLiveDate || null,
          signingStatus,
          abnormalNote: abnormalNote || null,
        });
        toast.success("入会签约信息已保存");
        onSaved();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存失败");
      }
    });
  };
  return (
    <div className="space-y-6">
      <FormSection title="入会与签约">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="入会日期">
            <Input
              type="date"
              value={joinDate}
              onChange={(event) => setJoinDate(event.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field label="首次开播日期">
            <Input
              type="date"
              value={firstLiveDate}
              onChange={(event) => setFirstLiveDate(event.target.value)}
              disabled={disabled}
            />
          </Field>
          <Field label="签约状态">
            <Select
              value={signingStatus}
              onValueChange={(value) => setSigningStatus(value ?? "pending")}
              disabled={disabled}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value: string | null) =>
                    value ? SIGNING_LABEL[value as keyof typeof SIGNING_LABEL] : "选择签约状态"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">待签约</SelectItem>
                <SelectItem value="signed">已签约</SelectItem>
                <SelectItem value="declined">不签约</SelectItem>
                <SelectItem value="abnormal">主播异常</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {signingStatus === "abnormal" && (
            <div className="sm:col-span-2">
              <Field label="异常说明">
                <Textarea
                  value={abnormalNote}
                  onChange={(event) => setAbnormalNote(event.target.value)}
                  placeholder="请填写主播异常原因"
                  disabled={disabled}
                />
              </Field>
            </div>
          )}
        </div>
      </FormSection>
      {!disabled && (
        <div className="flex justify-end">
          <Button onClick={submit} disabled={saving || pending}>
            {(saving || pending) && <LoaderCircle className="animate-spin" />}保存
          </Button>
        </div>
      )}
    </div>
  );
}

function EventTimeline({ detail }: { detail: RecruitmentCandidateDetail }) {
  if (detail.events.length === 0)
    return <div className="p-8 text-center text-sm text-muted-foreground">暂无跟进记录</div>;
  return (
    <ol className="space-y-0">
      {detail.events.map((event, index) => (
        <li key={event.id} className="relative grid grid-cols-[20px_1fr] gap-3 pb-5">
          {index < detail.events.length - 1 && (
            <span className="absolute top-4 bottom-0 left-[6px] w-px bg-border" />
          )}
          <span className="relative mt-1.5 size-3 rounded-full border-2 border-primary bg-card" />
          <div>
            <div className="text-sm font-medium">
              {EVENT_LABEL[event.eventType] ?? event.eventType}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {event.actorName ?? "系统"} ·{" "}
              {new Intl.DateTimeFormat("zh-CN", {
                timeZone: "Asia/Shanghai",
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(event.createdAt))}
            </div>
            {event.toStatus && (
              <div className="mt-1 text-xs text-muted-foreground">流程状态：{event.toStatus}</div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b pb-6 last:border-b-0 last:pb-0">
      <h3 className="mb-4 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function StaffPicker({
  value,
  staff,
  onChange,
  disabled,
}: {
  value: string;
  staff: StaffOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const selected = staff.find((person) => person.userId === value);
  const [query, setQuery] = useState(selected?.name ?? "");
  const filtered = staff.filter((person) =>
    person.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <div className="relative space-y-1">
      <Input
        disabled={disabled}
        value={query}
        placeholder="搜索姓名"
        onChange={(event) => {
          setQuery(event.target.value);
          if (value) onChange("");
        }}
      />
      {!disabled && query.trim() && !selected && filtered.length > 0 && (
        <div className="absolute z-20 max-h-48 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {filtered.map((person) => (
            <button
              type="button"
              key={person.userId}
              className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => {
                onChange(person.userId);
                setQuery(person.name);
              }}
            >
              {person.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FormActions({
  pending,
  onDraft,
  onAdvance,
}: {
  pending: boolean;
  onDraft: () => void;
  onAdvance: () => void;
}) {
  return (
    <div className="flex justify-end gap-2 border-t pt-4">
      <Button type="button" variant="outline" onClick={onDraft} disabled={pending}>
        保存草稿
      </Button>
      <Button type="button" onClick={onAdvance} disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" /> : <Check />}保存并继续
      </Button>
    </div>
  );
}
