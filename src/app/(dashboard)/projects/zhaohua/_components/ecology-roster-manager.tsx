"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2, UserRoundPen, UsersRound } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils/cn";
import type {
  AnchorStage,
  AnchorType,
  EcologyAnchorRecord,
  EcologyRosterState,
} from "../_data/project-roster";

type ManagerView = "anchors" | "operators";

const STAGES: AnchorStage[] = ["已开播", "培训中", "试岗中", "封号", "离职"];
const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const minutes = index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});
const DEFAULT_TIME_SLOTS = [
  { start: "09:00", end: "13:00" },
  { start: "18:00", end: "22:00" },
];
const FALLBACK_TIME_SLOT = { start: "09:00", end: "13:00" };
const ECOLOGY_MANAGER_NAME = "丁友发";

function cloneRoster(roster: EcologyRosterState): EcologyRosterState {
  return {
    operators: roster.operators.map((operator) => ({ ...operator })),
    anchors: roster.anchors.map((anchor) => ({ ...anchor })),
  };
}

function blankAnchor(operator: string): EcologyAnchorRecord {
  return {
    liveName: "待定",
    realName: null,
    source: "线下自营",
    institution: null,
    operator,
    stage: "培训中",
    anchorType: "生态主播",
    liveTimeSlots: [{ ...FALLBACK_TIME_SLOT }],
  };
}

function cleanOptional(value: string | undefined | null): string | undefined {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}

function normalizeRoster(roster: EcologyRosterState): EcologyRosterState {
  return {
    operators: roster.operators.map((operator) => ({
      name: operator.name.trim(),
      responsibility: operator.responsibility.trim() || "生态主播跟进",
    })),
    anchors: roster.anchors.map((anchor) => ({
      ...anchor,
      anchorType: anchor.anchorType ?? "生态主播",
      liveName: anchor.liveName.trim(),
      realName: cleanOptional(anchor.realName) ?? null,
      operator: anchor.operator.trim(),
      institution:
        anchor.source === "线上机构" ? (cleanOptional(anchor.institution) ?? null) : null,
      anchorId: cleanOptional(anchor.anchorId),
      douyinId: cleanOptional(anchor.douyinId),
      liveRoomUrl: cleanOptional(anchor.liveRoomUrl),
      stageNote: cleanOptional(anchor.stageNote),
      liveTimeSlots: (anchor.liveTimeSlots ?? [])
        .slice(0, 2)
        .filter((slot) => slot.start && slot.end),
    })),
  };
}

export function validateEcologyRoster(roster: EcologyRosterState): string | null {
  const operatorNames = roster.operators.map((operator) => operator.name.trim());
  if (operatorNames.length === 0) return "请至少保留 1 名运营";
  if (operatorNames.some((name) => !name)) return "运营姓名不能为空";
  if (new Set(operatorNames).size !== operatorNames.length) return "运营姓名不能重复";

  const operatorSet = new Set(operatorNames);
  operatorSet.add(ECOLOGY_MANAGER_NAME);
  for (const anchor of roster.anchors) {
    const displayName = anchor.realName?.trim() || anchor.liveName.trim() || "未命名主播";
    if (!anchor.liveName.trim()) return `${displayName} 的抖音昵称不能为空，未开播可填写“待定”`;
    if (anchor.source === "线下自营" && !anchor.realName?.trim()) {
      return `${displayName} 的真实姓名不能为空`;
    }
    if (!operatorSet.has(anchor.operator.trim())) return `${displayName} 需要选择有效的运营负责人`;
    if (anchor.source === "线上机构" && !anchor.institution?.trim()) {
      return `${displayName} 需要填写线上机构`;
    }
  }
  return null;
}

function stageTone(stage: AnchorStage): string {
  if (stage === "已开播") return "bg-emerald-50 text-emerald-700";
  if (stage === "培训中") return "bg-blue-50 text-blue-700";
  if (stage === "封号") return "bg-red-50 text-red-700";
  if (stage === "离职") return "bg-slate-100 text-slate-500";
  return "bg-amber-50 text-amber-700";
}

export function EcologyRosterManager({
  open,
  roster,
  saving,
  serverError,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  roster: EcologyRosterState;
  saving: boolean;
  serverError: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (next: EcologyRosterState) => Promise<boolean>;
}): React.JSX.Element {
  const [view, setView] = useState<ManagerView>("anchors");
  const [draft, setDraft] = useState<EcologyRosterState>(() => cloneRoster(roster));
  const [selectedAnchorIndex, setSelectedAnchorIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(cloneRoster(roster));
    setSelectedAnchorIndex(0);
    setError(null);
  }, [open, roster]);

  const selectedAnchor = draft.anchors[selectedAnchorIndex] ?? null;
  const operatorUsage = useMemo(() => {
    const usage = new Map<string, number>();
    for (const anchor of draft.anchors) {
      usage.set(anchor.operator, (usage.get(anchor.operator) ?? 0) + 1);
    }
    return usage;
  }, [draft.anchors]);

  const patchAnchor = (patch: Partial<EcologyAnchorRecord>) => {
    setDraft((current) => ({
      ...current,
      anchors: current.anchors.map((anchor, index) =>
        index === selectedAnchorIndex ? { ...anchor, ...patch } : anchor,
      ),
    }));
  };

  const addAnchor = () => {
    setDraft((current) => {
      const anchors = [...current.anchors, blankAnchor(current.operators[0]?.name ?? "")];
      setSelectedAnchorIndex(anchors.length - 1);
      return { ...current, anchors };
    });
    setView("anchors");
    setError(null);
  };

  const deleteSelectedAnchor = () => {
    setDraft((current) => ({
      ...current,
      anchors: current.anchors.filter((_, index) => index !== selectedAnchorIndex),
    }));
    setSelectedAnchorIndex((current) => Math.max(0, current - 1));
    setError(null);
  };

  const addOperator = () => {
    setDraft((current) => {
      let suffix = current.operators.length + 1;
      let name = `新运营 ${suffix}`;
      const names = new Set(current.operators.map((operator) => operator.name));
      while (names.has(name)) {
        suffix += 1;
        name = `新运营 ${suffix}`;
      }
      return {
        ...current,
        operators: [...current.operators, { name, responsibility: "生态主播跟进" }],
      };
    });
    setView("operators");
    setError(null);
  };

  const renameOperator = (index: number, name: string) => {
    setDraft((current) => {
      const previousName = current.operators[index]?.name;
      if (previousName === undefined) return current;
      return {
        operators: current.operators.map((operator, operatorIndex) =>
          operatorIndex === index ? { ...operator, name } : operator,
        ),
        anchors: current.anchors.map((anchor) =>
          anchor.operator === previousName ? { ...anchor, operator: name } : anchor,
        ),
      };
    });
  };

  const deleteOperator = (index: number) => {
    const operator = draft.operators[index];
    if (!operator) return;
    const assigned = operatorUsage.get(operator.name) ?? 0;
    if (assigned > 0) {
      setError(`${operator.name} 名下还有 ${assigned} 名主播，请先转移主播后再删除`);
      return;
    }
    setDraft((current) => ({
      ...current,
      operators: current.operators.filter((_, operatorIndex) => operatorIndex !== index),
    }));
    setError(null);
  };

  const save = async () => {
    const normalized = normalizeRoster(draft);
    const validationError = validateEcologyRoster(normalized);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    if (await onSave(normalized)) onOpenChange(false);
  };

  const fieldClass =
    "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[min(1080px,96vw)] !max-w-[1080px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-200 px-6 py-4">
          <DialogTitle>线下主播人员管理</DialogTitle>
          <DialogDescription>维护运营分工、主播阶段与账号信息，保存后全员同步。</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-6 py-2.5">
          <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
            {(
              [
                ["anchors", `主播名单 ${draft.anchors.length}`],
                ["operators", `运营人员 ${draft.operators.length}`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={cn(
                  "h-8 rounded px-3 text-xs font-medium",
                  view === key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={view === "anchors" ? addAnchor : addOperator}
          >
            <Plus className="size-4" />
            {view === "anchors" ? "新增主播" : "新增运营"}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {view === "anchors" ? (
            <div className="grid min-h-[520px] md:grid-cols-[300px_minmax(0,1fr)]">
              <div className="border-b border-slate-200 md:border-r md:border-b-0">
                <div className="max-h-[520px] overflow-y-auto p-2">
                  {draft.anchors.length === 0 ? (
                    <div className="grid min-h-40 place-items-center text-sm text-slate-400">
                      暂无主播
                    </div>
                  ) : (
                    draft.anchors.map((anchor, index) => (
                      <button
                        key={`${index}-${anchor.realName ?? anchor.liveName}`}
                        type="button"
                        onClick={() => setSelectedAnchorIndex(index)}
                        className={cn(
                          "mb-1 flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left",
                          selectedAnchorIndex === index
                            ? "bg-blue-50 ring-1 ring-blue-200"
                            : "hover:bg-slate-50",
                        )}
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                          {(anchor.realName ?? anchor.liveName ?? "主").slice(0, 1)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-800">
                            {anchor.realName || "实名待补充"}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {anchor.liveName || "昵称待补充"} · {anchor.anchorType ?? "生态主播"} ·{" "}
                            {anchor.operator || "未分配"}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 text-[10px]",
                            stageTone(anchor.stage),
                          )}
                        >
                          {anchor.stage}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="p-5 md:p-6">
                {selectedAnchor ? (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <UserRoundPen className="size-4 text-blue-600" />
                        <h3 className="font-semibold text-slate-900">编辑主播</h3>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={deleteSelectedAnchor}
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="size-4" />
                        删除主播
                      </Button>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-1.5">
                        <Label>真实姓名</Label>
                        <Input
                          value={selectedAnchor.realName ?? ""}
                          onChange={(event) =>
                            patchAnchor({ realName: event.target.value || null })
                          }
                          placeholder="线下主播必填"
                        />
                      </label>
                      <label className="grid gap-1.5">
                        <Label>抖音昵称</Label>
                        <Input
                          value={selectedAnchor.liveName}
                          onChange={(event) => patchAnchor({ liveName: event.target.value })}
                          placeholder="未开播可填“待定”"
                        />
                      </label>
                      <label className="grid gap-1.5">
                        <Label>当前阶段</Label>
                        <select
                          value={selectedAnchor.stage}
                          onChange={(event) =>
                            patchAnchor({ stage: event.target.value as AnchorStage })
                          }
                          className={fieldClass}
                        >
                          {STAGES.map((stage) => (
                            <option key={stage} value={stage}>
                              {stage}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1.5">
                        <Label>主播类型</Label>
                        <select
                          value={selectedAnchor.anchorType ?? "生态主播"}
                          onChange={(event) =>
                            patchAnchor({ anchorType: event.target.value as AnchorType })
                          }
                          className={fieldClass}
                        >
                          <option value="生态主播">生态主播</option>
                          <option value="竞价主播">竞价主播</option>
                        </select>
                      </label>
                      <label className="grid gap-1.5">
                        <Label>运营负责人</Label>
                        <select
                          value={selectedAnchor.operator}
                          onChange={(event) => patchAnchor({ operator: event.target.value })}
                          className={fieldClass}
                        >
                          <option value="">请选择运营</option>
                          <option value={ECOLOGY_MANAGER_NAME}>
                            {ECOLOGY_MANAGER_NAME}（项目负责人）
                          </option>
                          {draft.operators
                            .filter((operator) => operator.name !== ECOLOGY_MANAGER_NAME)
                            .map((operator) => (
                              <option key={operator.name} value={operator.name}>
                                {operator.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="grid gap-1.5">
                        <Label>人员来源</Label>
                        <select
                          value={selectedAnchor.source}
                          onChange={(event) => {
                            const source = event.target.value as EcologyAnchorRecord["source"];
                            patchAnchor({
                              source,
                              institution:
                                source === "线下自营" ? null : selectedAnchor.institution,
                            });
                          }}
                          className={fieldClass}
                        >
                          <option value="线下自营">线下自营</option>
                          <option value="线上机构">线上机构</option>
                        </select>
                      </label>
                      <label className="grid gap-1.5">
                        <Label>线上机构</Label>
                        <Input
                          value={selectedAnchor.institution ?? ""}
                          onChange={(event) =>
                            patchAnchor({ institution: event.target.value || null })
                          }
                          disabled={selectedAnchor.source !== "线上机构"}
                          placeholder="线上机构主播必填"
                        />
                      </label>
                      <label className="grid gap-1.5">
                        <Label>主播 UID</Label>
                        <Input
                          value={selectedAnchor.anchorId ?? ""}
                          onChange={(event) => patchAnchor({ anchorId: event.target.value })}
                          placeholder="用于绑定经营数据"
                        />
                      </label>
                      <label className="grid gap-1.5">
                        <Label>抖音号</Label>
                        <Input
                          value={selectedAnchor.douyinId ?? ""}
                          onChange={(event) => patchAnchor({ douyinId: event.target.value })}
                        />
                      </label>
                      <label className="grid gap-1.5">
                        <Label>直播间地址</Label>
                        <Input
                          value={selectedAnchor.liveRoomUrl ?? ""}
                          onChange={(event) => patchAnchor({ liveRoomUrl: event.target.value })}
                          placeholder="例如：https://live.douyin.com/844388807672"
                        />
                      </label>
                    </div>
                    <label className="grid gap-1.5">
                      <Label>阶段备注</Label>
                      <Textarea
                        value={selectedAnchor.stageNote ?? ""}
                        onChange={(event) => patchAnchor({ stageNote: event.target.value })}
                        placeholder="例如：试岗第 3 天、等待首播、培训考核中"
                        rows={2}
                      />
                    </label>
                    <div className="grid gap-2">
                      <Label>直播时间段</Label>
                      <p className="text-xs text-slate-500">
                        默认 1 个时段，可增加第 2 个，支持整点和半点。
                      </p>
                      {(() => {
                        const slots = (
                          selectedAnchor.liveTimeSlots?.length
                            ? selectedAnchor.liveTimeSlots
                            : [FALLBACK_TIME_SLOT]
                        )
                          .slice(0, 2)
                          .map((item, index) => ({
                            start:
                              item?.start ??
                              DEFAULT_TIME_SLOTS[index]?.start ??
                              FALLBACK_TIME_SLOT.start,
                            end:
                              item?.end ?? DEFAULT_TIME_SLOTS[index]?.end ?? FALLBACK_TIME_SLOT.end,
                          }));
                        return slots.map((slot, slotIndex) => {
                          return (
                            <div
                              key={slotIndex}
                              className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2"
                            >
                              <select
                                value={slot.start}
                                onChange={(event) =>
                                  patchAnchor({
                                    liveTimeSlots: slots.map((current, index) =>
                                      index === slotIndex
                                        ? { ...current, start: event.target.value }
                                        : current,
                                    ),
                                  })
                                }
                                className={fieldClass}
                              >
                                {TIME_OPTIONS.map((time) => (
                                  <option key={time}>{time}</option>
                                ))}
                              </select>
                              <span className="text-xs text-slate-400">至</span>
                              <select
                                value={slot.end}
                                onChange={(event) =>
                                  patchAnchor({
                                    liveTimeSlots: slots.map((current, index) =>
                                      index === slotIndex
                                        ? { ...current, end: event.target.value }
                                        : current,
                                    ),
                                  })
                                }
                                className={fieldClass}
                              >
                                {TIME_OPTIONS.map((time) => (
                                  <option key={time}>{time}</option>
                                ))}
                              </select>
                              {slotIndex === 1 ? (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="text-red-500"
                                  onClick={() => patchAnchor({ liveTimeSlots: slots.slice(0, 1) })}
                                  aria-label="删除第二个直播时段"
                                >
                                  ×
                                </Button>
                              ) : null}
                            </div>
                          );
                        });
                      })()}
                      {!selectedAnchor.liveTimeSlots || selectedAnchor.liveTimeSlots.length < 2 ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="w-fit"
                          onClick={() =>
                            patchAnchor({
                              liveTimeSlots: [
                                ...(selectedAnchor.liveTimeSlots?.length
                                  ? selectedAnchor.liveTimeSlots
                                  : [FALLBACK_TIME_SLOT]),
                                { ...(DEFAULT_TIME_SLOTS[1] ?? { start: "18:00", end: "22:00" }) },
                              ],
                            })
                          }
                        >
                          ＋ 增加时间段
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="grid min-h-72 place-items-center text-sm text-slate-400">
                    新增一名主播后即可编辑资料
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-6">
              <div className="mb-4 flex items-start gap-2 text-sm text-slate-500">
                <UsersRound className="mt-0.5 size-4 shrink-0" />
                <p>修改运营姓名会同步更新其名下主播；名下仍有主播时不能删除运营。</p>
              </div>
              <div className="divide-y divide-slate-100 border-y border-slate-200">
                {draft.operators.map((operator, index) => (
                  <div
                    key={`${index}-${operator.name}`}
                    className="grid items-center gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_110px_40px]"
                  >
                    <Input
                      value={operator.name}
                      onChange={(event) => renameOperator(index, event.target.value)}
                      aria-label={`运营 ${index + 1} 姓名`}
                    />
                    <span className="text-xs text-slate-500">
                      跟进 {operatorUsage.get(operator.name) ?? 0} 名主播
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteOperator(index)}
                      aria-label={`删除运营 ${operator.name}`}
                      className="text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {error || serverError ? (
          <p className="border-t border-red-100 bg-red-50 px-6 py-2 text-sm text-red-700">
            {error ?? serverError}
          </p>
        ) : null}
        <DialogFooter className="border-t border-slate-200 px-6 py-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            取消
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            <Save className="size-4" />
            {saving ? "保存中..." : "保存并同步"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
