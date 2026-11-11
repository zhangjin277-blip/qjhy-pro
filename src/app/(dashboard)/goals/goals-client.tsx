"use client";
import { GoalDetailContent } from "./goal-detail-content";
import { useGoalList } from "./use-goal-list";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Autocomplete } from "@base-ui/react/autocomplete";
import { ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { businessDate } from "@/lib/business-date";
import {
  formatGoalValue as fmt,
  type Goal,
  type GoalDefinition,
  type GoalList,
  type GoalRevision,
} from "@/modules/goals";
import styles from "./goals.module.css";
import { MetricPicker, bindingForProject } from "./metric-picker";
import { useSourceOptions } from "./use-source-options";
import { draftFromDefinition, metricDefinitions, type MetricDraft } from "./metric-drafts";
import { StandardMetricSettings } from "./standard-metric-settings";
import { GoalGroupsTable } from "./goal-groups-table";
import { GoalWeightsEditor } from "./goal-weights-editor";
import { GoalSplitDialog } from "./goal-split-dialog";
import { GoalPeriodPicker } from "./goal-period-picker";
import { PersonalGoalDialog, GoalTypeSwitch } from "./personal-goal-dialog";
import { pendingTeamMetricGoals } from "@/modules/goals/team-publication";
import { allocationBindingKey, validateMetricWeights } from "@/modules/goals/rules";
import { groupGoals } from "@/modules/goals/presentation";

const statusLabel = { draft: "草稿", published: "已发布", closed: "已归档" };
const actionLabel: Record<string, string> = {
  create: "创建目标",
  edit: "调整目标",
  progress: "填报进度",
  publish: "发布目标",
  "publish-children": "发布下属个人目标",
  close: "归档目标",
  reopen: "重新开启",
  cascade: "同步季度口径",
  delete: "删除目标",
  "refresh-accounts": "更新归属账号范围",
  "team-weights": "同步团队指标权重",
};
const fieldLabel: Record<string, string> = {
  period: "周期",
  project: "项目",
  line: "业务线",
  dept_id: "部门",
  owner_ids: "负责人",
  owner_labels: "待绑定负责人",
  metric: "指标",
  binding: "数据来源与账号范围",
  unit: "单位",
  kind: "指标类型",
  target: "目标值",
  weight: "指标权重",
  actual: "实际值",
  as_of: "统计日期",
  evidence: "统计依据",
  definition: "统计口径",
  confirmed: "口径确认",
  parent_id: "关联季度",
  team_parent_id: "所属团队目标",
  status: "状态",
  deleted_at: "删除时间",
};
const definitionOf = (g: Goal): GoalDefinition => ({
  period: g.period,
  project: g.project,
  line: g.line,
  dept_id: g.dept_id,
  owner_ids: g.owner_ids,
  owner_labels: g.owner_labels,
  metric: g.metric,
  binding: g.binding ?? null,
  unit: g.unit,
  kind: g.kind,
  target: g.target,
  weight: g.weight ?? null,
  definition: g.definition,
  confirmed: g.confirmed,
  parent_id: g.parent_id,
  team_parent_id: g.team_parent_id ?? null,
});
function empty(period: string): GoalDefinition {
  return {
    period,
    project: "",
    line: "整体",
    dept_id: null,
    owner_ids: [],
    owner_labels: [],
    metric: "流水",
    binding: null,
    unit: "元",
    kind: "sum",
    target: null,
    weight: null,
    definition: "",
    confirmed: false,
    parent_id: null,
    team_parent_id: null,
  };
}
export function GoalsClient({ initial }: { initial: GoalList }) {
  const [period, setPeriod] = useState(businessDate().slice(0, 7)),
    [project, setProject] = useState("全部项目"),
    [status, setStatus] = useState("all");
  const { data, reload, loading: periodLoading, error: listError } = useGoalList(initial, period);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState<"edit" | "progress" | "detail" | "history" | "action" | null>(null),
    [selected, setSelected] = useState<Goal | null>(null);
  const [definition, setDefinitionState] = useState<GoalDefinition>(empty(period)),
    [actual, setActual] = useState(""),
    [asOf, setAsOf] = useState(businessDate()),
    [evidence, setEvidence] = useState(""),
    [reason, setReason] = useState("");
  const [groupSelection, setGroupSelection] = useState<Goal[]>([]);
  const [independentDefinitions, setIndependentDefinitions] = useState<GoalDefinition[] | null>(
    null,
  );
  const [additionalMetrics, setAdditionalMetrics] = useState<MetricDraft[]>([]);
  const [notice, setNotice] = useState("");
  const [splitSelection, setSplitSelection] = useState<Goal[] | null>(null);
  const [personalOpen, setPersonalOpen] = useState(false);
  const [personalEditing, setPersonalEditing] = useState<Goal[]>([]);
  const [publishChildren, setPublishChildren] = useState(true);
  // Keep the confirmation snapshot stable while background refresh updates the list.
  const [publicationChildren, setPublicationChildren] = useState<Goal[]>([]);
  function openPersonal(goals: Goal[] = []) {
    setMode(null);
    setPersonalEditing(goals);
    setPersonalOpen(true);
    setNotice("");
  }
  function setDefinition(next: GoalDefinition) {
    if (
      next.project !== definition.project ||
      next.binding?.source !== definition.binding?.source ||
      next.binding?.product !== definition.binding?.product
    )
      setAdditionalMetrics([]);
    else if (
      next.period !== definition.period ||
      next.line !== definition.line ||
      next.dept_id !== definition.dept_id
    )
      setAdditionalMetrics((items) => items.map((item) => ({ ...item, parent_id: null })));
    setDefinitionState(next);
  }
  const [action, setAction] = useState("publish"),
    [history, setHistory] = useState<GoalRevision[]>([]),
    [search, setSearch] = useState("");
  const names = useMemo(() => new Map(data.users.map((u) => [u.id, u.name])), [data.users]);
  const departmentOptions = useMemo(() => {
    const uses = new Map<string, number>();
    for (const group of groupGoals(data.items.filter((goal) => !goal.deleted_at))) {
      const departmentId = group.items[0]?.dept_id;
      if (departmentId) uses.set(departmentId, (uses.get(departmentId) ?? 0) + 1);
    }
    return data.departments
      .map((department, index) => ({ department, index }))
      .sort(
        (a, b) =>
          (uses.get(b.department.id) ?? 0) - (uses.get(a.department.id) ?? 0) ||
          Number(b.department.name.includes("运营")) - Number(a.department.name.includes("运营")) ||
          a.index - b.index,
      )
      .map(({ department }) => department);
  }, [data.departments, data.items]);
  const sourceOptions = useSourceOptions(
    mode === "edit" || (mode === "action" && action === "refresh-accounts")
      ? definition.binding
      : null,
    definition.dept_id,
  );
  const ownerOptions = definition.binding
    ? [
        ...(sourceOptions.data?.users ?? []),
        ...data.users.filter(
          (u) =>
            definition.owner_ids.includes(u.id) &&
            !sourceOptions.data?.users.some((item) => item.id === u.id),
        ),
      ]
    : data.users.filter((u) => !definition.dept_id || u.deptIds.includes(definition.dept_id));
  const people = (g: Pick<GoalDefinition, "owner_ids" | "owner_labels">) =>
    [
      ...g.owner_ids.map((id) => names.get(id) ?? "已绑定员工"),
      ...g.owner_labels.map((n) => n + "（待绑定）"),
    ].join("、") || "负责人待配置";
  const current = data.items.filter((g) => g.period === period),
    rows = current.filter(
      (g) =>
        (project === "全部项目" || g.project === project) &&
        (status === "all" || g.status === status),
    );
  const quartersFor = (value: GoalDefinition) =>
    data.items.filter(
      (g) =>
        !g.deleted_at &&
        !value.period.includes("Q") &&
        g.period ===
          `${value.period.slice(0, 4)}-Q${Math.ceil(Number(value.period.slice(5)) / 3)}` &&
        g.id !== selected?.id &&
        g.project === value.project &&
        g.dept_id === value.dept_id &&
        g.metric === value.metric &&
        g.unit === value.unit &&
        g.kind === value.kind &&
        allocationBindingKey(g.binding) === allocationBindingKey(value.binding) &&
        [...g.owner_ids].sort().join("|") === [...value.owner_ids].sort().join("|") &&
        [...g.owner_labels].sort().join("|") === [...value.owner_labels].sort().join("|"),
    );
  function allocation(g: Goal) {
    if (!g.period.includes("Q") || g.kind === "ratio" || g.target === null) return "";
    const months = data.items.filter((item) => item.parent_id === g.id);
    const assigned = months.reduce((sum, item) => sum + (item.target ?? 0), 0);
    return `已分配 ${fmt(assigned, g.unit)} · 待分配 ${fmt(Math.max(0, g.target - assigned), g.unit)}`;
  }
  async function save(payload: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error);
      await reload();
      setNotice(
        mode === "action" &&
          (action === "publish-children" ||
            (action === "publish" && publishChildren && publicationChildren.length > 0))
          ? `已发布${publicationChildren.length}项个人目标${selected?.status === "draft" ? "及团队指标" : ""}。`
          : Array.isArray(json.items)
            ? groupSelection.length
              ? action === "close" && mode === "action"
                ? `已归档${json.items.length}项已发布指标；草稿保留。`
                : `已统一调整${json.items.length}项指标；原有状态保留，新增指标为草稿。`
              : `已保存${json.items.length}项指标；新增指标为草稿，请核对后单独发布。`
            : "",
      );
      setMode(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  function open(
    mode: "edit" | "progress" | "detail" | "action",
    g: Goal | null = null,
    nextAction = "publish",
  ) {
    if (g?.read_only && mode !== "detail") return;
    if (mode === "edit" && !g && !data.access.canManageTeam) {
      openPersonal();
      return;
    }
    if (mode === "edit" && g && (g.team_parent_id || g.binding?.selection === "operators")) {
      const group = groupGoals(data.items).find((group) =>
        group.items.some((item) => item.id === g.id),
      );
      openPersonal(group?.current.length ? group.current : [g]);
      return;
    }
    setGroupSelection([]);
    setIndependentDefinitions(null);
    setSelected(g);
    setMode(mode);
    setError("");
    setReason("");
    setSearch("");
    setAdditionalMetrics([]);
    setNotice("");
    setAction(nextAction);
    setPublishChildren(true);
    const publicationTeam =
      g && data.access.canManageTeam && !g.team_parent_id && g.binding?.selection !== "operators"
        ? (groupGoals(data.items).find((group) => group.items.some((item) => item.id === g.id))
            ?.items ?? [])
        : [];
    setPublicationChildren(g ? pendingTeamMetricGoals(g, publicationTeam, data.items) : []);
    setDefinition(g ? definitionOf(g) : empty(period));
    setActual(g?.actual == null ? "" : String(g.actual));
    setAsOf(g?.as_of ?? businessDate());
    setEvidence(g?.evidence ?? "");
  }
  function openGroup(nextMode: "edit" | "close", goals: Goal[]) {
    if (goals.some((g) => g.read_only)) return;
    const first = goals[0];
    if (!first) return;
    if (nextMode === "edit" && (first.team_parent_id || first.binding?.selection === "operators")) {
      openPersonal(goals);
      return;
    }
    open(nextMode === "edit" ? "edit" : "action", first, "close");
    setGroupSelection(goals);
    if (nextMode !== "edit") return;
    const scope = (goal: Goal) =>
      JSON.stringify([
        goal.binding?.source,
        goal.binding?.product,
        goal.binding?.selection,
        [...(goal.binding?.account_ids ?? [])].sort(),
        goal.confirmed,
      ]);
    const uniform =
      first.binding &&
      goals.length <= 20 &&
      goals.every((g) => g.binding && scope(g) === scope(first)) &&
      new Set(goals.map((g) => g.binding?.field)).size === goals.length;
    if (uniform)
      setAdditionalMetrics(
        goals.slice(1).flatMap((g) => {
          const draft = draftFromDefinition(definitionOf(g));
          return draft ? [draft] : [];
        }),
      );
    else setIndependentDefinitions(goals.map(definitionOf));
  }
  async function showHistory(g: Goal) {
    setSelected(g);
    setHistory([]);
    setMode("history");
    setError("");
    setBusy(true);
    try {
      const r = await fetch(`/api/goals?history=${g.id}`, { cache: "no-store" });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error);
      setHistory(json.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "记录加载失败");
    } finally {
      setBusy(false);
    }
  }
  function copyGoal(g: Goal) {
    if (g.team_parent_id || g.binding?.selection === "operators") {
      openPersonal();
      return;
    }
    open("edit");
    setDefinition({
      ...definitionOf(g),
      period,
      parent_id: null,
      team_parent_id: null,
      weight: null,
      binding: g.binding,
    });
    setReason("复制目标定义（不复制完成值）");
  }
  function submit() {
    if (!reason.trim()) {
      setError("请填写本次操作原因");
      return;
    }
    if (
      mode === "action" &&
      selected &&
      (action === "publish-children" ||
        (action === "publish" && publishChildren && publicationChildren.length > 0))
    ) {
      void save({
        action: "publish-team",
        goal: { id: selected.id, version: selected.version },
        children: publicationChildren.map((g) => ({ id: g.id, version: g.version })),
        reason,
      });
      return;
    }
    if (mode === "edit") {
      try {
        validateMetricWeights(
          independentDefinitions ?? metricDefinitions(definition, additionalMetrics),
        );
      } catch (error) {
        setError(error instanceof Error ? error.message : "请核对指标权重");
        return;
      }
    }
    if (groupSelection.length) {
      if (mode === "action") {
        void save({
          action: "close-group",
          goals: groupSelection
            .filter((g) => g.status === "published")
            .map((g) => ({ id: g.id, version: g.version })),
          reason,
        });
      } else {
        const definitions =
          independentDefinitions ?? metricDefinitions(definition, additionalMetrics);
        const entries = definitions.map((item, index) => {
          const original = independentDefinitions
            ? groupSelection[index]
            : groupSelection.find((g) => g.binding?.field === item.binding?.field);
          return {
            edit: original ? { id: original.id, version: original.version } : null,
            definition: item,
          };
        });
        void save({ action: "edit-group", entries, reason });
      }
      return;
    }
    if (mode === "edit" && additionalMetrics.length) {
      const definitions = metricDefinitions(definition, additionalMetrics);
      const originalIndex = selected?.binding
        ? definitions.findIndex((item) => item.binding?.field === selected.binding?.field)
        : -1;
      if (originalIndex > 0) definitions.unshift(...definitions.splice(originalIndex, 1));
      void save({
        action: "save-metrics",
        definitions,
        edit: selected ? { id: selected.id, version: selected.version } : null,
        reason,
      });
    } else if (mode === "edit")
      void save(
        selected
          ? { action: "edit", id: selected.id, version: selected.version, definition, reason }
          : { action: "create", definition, reason },
      );
    else if (selected)
      void save(
        mode === "progress"
          ? {
              action: "progress",
              id: selected.id,
              version: selected.version,
              actual: actual === "" ? null : Number(actual),
              as_of: actual === "" ? null : asOf,
              evidence,
              reason,
            }
          : { action, id: selected.id, version: selected.version, reason },
      );
  }
  const revisionsText = (revision: GoalRevision) =>
    Object.entries(fieldLabel)
      .filter(
        ([key]) => JSON.stringify(revision.before?.[key]) !== JSON.stringify(revision.after[key]),
      )
      .map(([key, label]) => {
        const display = (v: unknown) =>
          key === "binding" && v && typeof v === "object" && "source" in v
            ? `${v.source === "douyin" ? "抖音主播明细" : "捕鱼投流日志"} · ${"selection" in v && v.selection === "all" ? "整个产品" : "指定账号"}`
            : key === "owner_ids" && Array.isArray(v)
              ? v.map((id) => names.get(String(id)) ?? "已绑定员工").join("、")
              : key === "dept_id"
                ? (data.departments.find((d) => d.id === v)?.name ?? "未指定")
                : key === "parent_id"
                  ? (data.items.find((g) => g.id === v)?.period ?? "未关联")
                  : v === null || v === undefined
                    ? "未设置"
                    : v === true
                      ? "已确认"
                      : v === false
                        ? "待配置"
                        : Array.isArray(v)
                          ? v.join("、")
                          : String(v);
        return `${label}：${display(revision.before?.[key])} → ${display(revision.after[key])}`;
      })
      .join("\n");
  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <div>
          <h1>目标管理</h1>
          <p>把目标、责任与进度放在一起，按月跟进，按季复盘。</p>
        </div>
        <div className={styles.actions}>
          <Link href="/dashboard" className={styles.button}>
            返回工作台
          </Link>
          {data.access.fill && (
            <button className={styles.primary} onClick={() => open("edit")}>
              ＋ 新建目标
            </button>
          )}
        </div>
      </div>
      <div className={styles.summary}>
        {[
          ["本期指标", current.length, "各指标独立跟进"],
          ["已发布", current.filter((g) => g.status === "published").length, "同步展示于工作台"],
          [
            "待配置",
            current.filter((g) => !g.confirmed || g.target === null).length,
            "口径、负责人或目标待完善",
          ],
          [
            "待跟进",
            current.filter(
              (g) =>
                g.confirmed &&
                (g.actual === null || g.source_result?.status === "partial") &&
                g.status !== "closed",
            ).length,
            "等待同步或人工补充进度",
          ],
        ].map(([title, value, note]) => (
          <div className={styles.stat} key={title}>
            <span>{title}</span>
            <strong>{title === "待跟进" && periodLoading ? "—" : value}</strong>
            <span>{note}</span>
          </div>
        ))}
      </div>
      {!mode && error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {!mode && notice && (
        <p role="status" className={styles.metricNote}>
          {notice}
        </p>
      )}
      <section className={styles.card}>
        <div className={styles.toolbar}>
          <div className={styles.periods}>
            <div className={styles.periodSwitch} role="group" aria-label="周期类型">
              <button
                type="button"
                aria-pressed={!period.includes("Q")}
                onClick={() => {
                  if (period.includes("Q"))
                    setPeriod(
                      `${period.slice(0, 4)}-${String((Number(period.slice(-1)) - 1) * 3 + 1).padStart(2, "0")}`,
                    );
                }}
              >
                月度目标
              </button>
              <button
                type="button"
                aria-pressed={period.includes("Q")}
                onClick={() => {
                  if (!period.includes("Q"))
                    setPeriod(
                      `${period.slice(0, 4)}-Q${Math.ceil(Number(period.slice(5, 7)) / 3)}`,
                    );
                }}
              >
                季度目标
              </button>
            </div>
            {period.includes("Q") ? (
              <>
                <input
                  aria-label="年份"
                  type="number"
                  min="2000"
                  max="2099"
                  value={period.slice(0, 4)}
                  onChange={(e) => setPeriod(`${e.target.value}-Q${period.slice(-1)}`)}
                  style={{ width: 85 }}
                />
                <select
                  aria-label="季度"
                  value={period.slice(-1)}
                  onChange={(e) => setPeriod(`${period.slice(0, 4)}-Q${e.target.value}`)}
                >
                  {[1, 2, 3, 4].map((q) => (
                    <option key={q} value={q}>
                      Q{q}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <input
                aria-label="目标月份"
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            )}
            <select
              aria-label="项目筛选"
              value={project}
              onChange={(e) => setProject(e.target.value)}
            >
              {["全部项目", ...new Set(data.items.map((g) => g.project))].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            <select
              aria-label="状态筛选"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">全部状态</option>
              {Object.entries(statusLabel).map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <button
            className={styles.button}
            onClick={() => void reload().catch((e) => setError(e.message))}
          >
            刷新数据
          </button>
        </div>
        {listError && (
          <p role="alert" className={styles.error}>
            {listError}
          </p>
        )}
        {periodLoading && !listError && (
          <p role="status" className={styles.empty}>
            正在加载本期目标进度…
          </p>
        )}
        {!periodLoading && (
          <GoalGroupsTable
            items={rows}
            allItems={data.items}
            access={data.access}
            departments={data.departments}
            people={people}
            allocation={allocation}
            onOpen={open}
            onGroupOpen={openGroup}
            onSplit={setSplitSelection}
          />
        )}
        {!periodLoading && !rows.length && (
          <div className={styles.empty}>
            当前周期暂无符合条件的目标。可新建目标，或切换周期查看。
          </div>
        )}
        <div className={styles.footnote}>
          按项目、部门及负责人查看；归档目标不计入当前达成项数。抖音累计指标中，本期无记录账号按0计入；已有记录但指标字段为空时提示待补齐。ROI按门槛比较，综合达成率按各指标权重汇总。当前查看范围：
          {({ self: "本人", team: "负责团队", all: "全部" } as Record<string, string>)[
            data.access.scope
          ] ?? data.access.scope}
          ；另可只读查看本人参与的已发布团队目标。
        </div>
      </section>
      {splitSelection && (
        <GoalSplitDialog
          goals={splitSelection}
          allItems={data.items}
          departments={data.departments}
          onClose={() => setSplitSelection(null)}
          onSaved={async (count) => {
            await reload();
            setSplitSelection(null);
            setNotice(`已为${count}位运营创建个人目标草稿，展开团队即可查看。`);
          }}
        />
      )}
      {personalOpen && (
        <PersonalGoalDialog
          data={data}
          departments={departmentOptions}
          initialPeriod={period}
          existing={personalEditing}
          onClose={() => setPersonalOpen(false)}
          onTeam={() => {
            setPersonalOpen(false);
            open("edit");
          }}
          onSaved={async () => {
            await reload();
            setPersonalOpen(false);
            setNotice(
              personalEditing.length
                ? "已调整个人目标值，原有发布状态保留。"
                : "已提交个人目标，负责人可在团队指标下调整并发布。",
            );
          }}
        />
      )}
      <Dialog
        open={mode !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setMode(null);
        }}
      >
        <DialogContent
          className={`max-h-[88vh] overflow-y-auto ${mode === "detail" ? "sm:max-w-[1060px]" : "sm:max-w-[820px]"}`}
        >
          <DialogTitle>
            {mode === "edit"
              ? groupSelection.length
                ? "统一调整目标"
                : selected
                  ? "调整目标"
                  : "新建目标"
              : mode === "progress"
                ? "填报实际进度"
                : mode === "history"
                  ? "目标调整记录"
                  : mode === "action"
                    ? groupSelection.length
                      ? "整组归档目标"
                      : actionLabel[action]
                    : "目标详情"}
          </DialogTitle>
          <DialogDescription>
            {groupSelection.length && selected
              ? `${selected.period} · ${selected.project} · ${people(selected)} · ${groupSelection.length}项指标`
              : selected
                ? `${selected.period} · ${selected.project} · ${selected.metric}`
                : "先保存草稿，核对后单独发布。"}
          </DialogDescription>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          {mode === "edit" && !selected && data.access.canManageTeam && (
            <GoalTypeSwitch personal={false} onPersonal={() => openPersonal()} />
          )}
          {mode === "edit" && independentDefinitions && (
            <div className={styles.form}>
              <p className={`${styles.muted} ${styles.full}`}>
                这一组指标的账号范围或类型不同，分别保留原配置，可在这里统一调整目标值、条件与口径，一次保存。
              </p>
              <GoalWeightsEditor
                definitions={independentDefinitions}
                onChange={setIndependentDefinitions}
              />
              {independentDefinitions.map((item, index) => (
                <div className={styles.full} key={groupSelection[index]?.id}>
                  <label>
                    {item.metric} · 目标值（{item.unit}）
                    <input
                      aria-label={`目标值·${item.metric}·${index + 1}`}
                      type="number"
                      min="0"
                      step={item.kind === "count" ? "1" : "any"}
                      value={item.target ?? ""}
                      onChange={(e) =>
                        setIndependentDefinitions(
                          (current) =>
                            current?.map((d, i) =>
                              i === index
                                ? {
                                    ...d,
                                    target: e.target.value === "" ? null : Number(e.target.value),
                                  }
                                : d,
                            ) ?? null,
                        )
                      }
                    />
                  </label>
                  <p className={styles.muted}>
                    {statusLabel[groupSelection[index]?.status ?? "draft"]} ·{" "}
                    {item.binding
                      ? item.binding.selection === "operators"
                        ? "个人目标 · 按运营归属自动匹配"
                        : item.binding.selection === "all"
                          ? "全部归属账号"
                          : `${item.binding.account_ids.length}个指定账号`
                      : "人工指标"}
                  </p>
                  {item.binding ? (
                    <StandardMetricSettings
                      value={item}
                      quarters={quartersFor(item)}
                      onChange={(next) =>
                        setIndependentDefinitions(
                          (current) => current?.map((d, i) => (i === index ? next : d)) ?? null,
                        )
                      }
                    />
                  ) : (
                    <label>
                      统计口径
                      <textarea
                        value={item.definition}
                        onChange={(e) =>
                          setIndependentDefinitions(
                            (current) =>
                              current?.map((d, i) =>
                                i === index
                                  ? { ...d, definition: e.target.value, confirmed: false }
                                  : d,
                              ) ?? null,
                          )
                        }
                      />
                    </label>
                  )}
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={item.confirmed}
                      onChange={(e) =>
                        setIndependentDefinitions(
                          (current) =>
                            current?.map((d, i) =>
                              i === index ? { ...d, confirmed: e.target.checked } : d,
                            ) ?? null,
                        )
                      }
                    />
                    已核对本项指标口径与账号范围
                  </label>
                </div>
              ))}
            </div>
          )}
          {mode === "edit" && !independentDefinitions && (
            <div className={styles.form}>
              <GoalPeriodPicker
                value={definition.period}
                disabled={!!definition.team_parent_id}
                onChange={(period) => setDefinition({ ...definition, period, parent_id: null })}
              />
              <fieldset className={styles.periodField}>
                <legend>项目</legend>
                <Autocomplete.Root
                  value={definition.project}
                  disabled={groupSelection.length > 0 || !!definition.team_parent_id}
                  openOnInputClick
                  items={[
                    ...new Set([
                      "斗地主",
                      "三冰",
                      "造化",
                      "捕鱼",
                      ...data.items.map((g) => g.project),
                    ]),
                  ]}
                  onValueChange={(project) =>
                    setDefinition({
                      ...definition,
                      project,
                      owner_ids: [],
                      owner_labels: [],
                      binding: bindingForProject(project),
                      metric: bindingForProject(project) ? "" : definition.metric,
                      confirmed: false,
                      parent_id: null,
                    })
                  }
                >
                  <Autocomplete.InputGroup className={styles.projectInputGroup}>
                    <Autocomplete.Input aria-label="项目" placeholder="选择或输入项目" />
                    <Autocomplete.Trigger
                      className={styles.projectTrigger}
                      aria-label="展开项目选项"
                    >
                      <ChevronDown size={14} />
                    </Autocomplete.Trigger>
                  </Autocomplete.InputGroup>
                  <Autocomplete.Portal>
                    <Autocomplete.Positioner
                      className={styles.projectPositioner}
                      sideOffset={4}
                      align="start"
                    >
                      <Autocomplete.Popup className={styles.projectPopup}>
                        <Autocomplete.List>
                          {(project: string) => (
                            <Autocomplete.Item
                              key={project}
                              value={project}
                              className={styles.projectOption}
                            >
                              {project}
                            </Autocomplete.Item>
                          )}
                        </Autocomplete.List>
                      </Autocomplete.Popup>
                    </Autocomplete.Positioner>
                  </Autocomplete.Portal>
                </Autocomplete.Root>
              </fieldset>
              <label className={styles.full}>
                归属部门
                <select
                  value={definition.dept_id ?? ""}
                  disabled={!!definition.team_parent_id}
                  onChange={(e) =>
                    setDefinition({
                      ...definition,
                      dept_id: e.target.value || null,
                      owner_ids: [],
                      owner_labels: [],
                      binding: definition.binding
                        ? { ...definition.binding, selection: "accounts", account_ids: [] }
                        : null,
                      confirmed: false,
                      parent_id: null,
                    })
                  }
                >
                  <option value="">未指定 / 跨部门</option>
                  {departmentOptions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.full}>
                <label>
                  负责人
                  <input
                    aria-label="搜索负责人"
                    placeholder="搜索姓名，点击选择；可多人负责"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <div className={styles.owners}>
                  {ownerOptions
                    .filter((u) => u.name.includes(search) || definition.owner_ids.includes(u.id))
                    .map((u) => (
                      <button
                        key={u.id}
                        className={`${styles.owner} ${definition.owner_ids.includes(u.id) ? styles.selected : ""}`}
                        onClick={() =>
                          setDefinition({
                            ...definition,
                            owner_ids:
                              definition.binding?.selection === "operators"
                                ? definition.owner_ids.includes(u.id)
                                  ? []
                                  : [u.id]
                                : definition.owner_ids.includes(u.id)
                                  ? definition.owner_ids.filter((id) => id !== u.id)
                                  : [...definition.owner_ids, u.id],
                          })
                        }
                      >
                        {definition.owner_ids.includes(u.id) ? "✓ " : ""}
                        {u.name}
                      </button>
                    ))}
                </div>
                {definition.binding && sourceOptions.status === "loading" && (
                  <p className={styles.muted}>正在读取归属人员…</p>
                )}
                {(!definition.binding || sourceOptions.status === "ready") && (
                  <p className={styles.muted}>
                    {definition.binding ? "按所选产品、部门的业务归因筛选" : "按所选部门筛选"} ·
                    可选 {ownerOptions.length} 人
                    {!ownerOptions.length ? "，暂无符合范围的人员" : ""}
                  </p>
                )}
                <p className={styles.muted}>已选：{people(definition)}</p>
              </div>
              <MetricPicker
                key={`${definition.binding?.source}:${definition.binding?.product}:${definition.dept_id}`}
                value={definition}
                lockedFields={groupSelection.flatMap((g) => (g.binding ? [g.binding.field] : []))}
                onChange={setDefinition}
                sourceOptions={sourceOptions}
                additionalMetrics={additionalMetrics}
                onAdditionalMetricsChange={setAdditionalMetrics}
              />
              <GoalWeightsEditor
                definitions={metricDefinitions(definition, additionalMetrics)}
                onChange={(items) => {
                  const first = items[0];
                  if (first) setDefinition(first);
                  setAdditionalMetrics(
                    items.slice(1).flatMap((item) => {
                      const draft = draftFromDefinition(item);
                      return draft ? [draft] : [];
                    }),
                  );
                }}
              />
              {definition.binding && (
                <>
                  <p className={`${styles.muted} ${styles.full}`}>
                    每项指标的详细设置分别显示如下，条件、口径与关联季度独立保存。
                    {groupSelection.length
                      ? "已有指标统一更新并保留原状态；可增加新指标，新指标保存为草稿。已有指标如需移除，请归档或删除。"
                      : selected
                        ? "已有目标按本次设置更新，其他指标另存为草稿。"
                        : "每项指标将分别保存为草稿。"}
                  </p>
                  {metricDefinitions(definition, additionalMetrics).map((item, index) => (
                    <StandardMetricSettings
                      key={item.binding?.field}
                      value={item}
                      quarters={quartersFor(item)}
                      onChange={(next) => {
                        if (index === 0) setDefinition(next);
                        else {
                          const draft = draftFromDefinition(next);
                          if (draft)
                            setAdditionalMetrics((items) =>
                              items.map((value, i) => (i === index - 1 ? draft : value)),
                            );
                          setDefinition({ ...definition, confirmed: false });
                        }
                      }}
                    />
                  ))}
                </>
              )}
              {!definition.binding && (
                <>
                  <label>
                    指标{" "}
                    <input
                      value={definition.metric}
                      onChange={(e) =>
                        setDefinition({ ...definition, metric: e.target.value, parent_id: null })
                      }
                    />
                  </label>
                  <label>
                    类型
                    <select
                      value={definition.kind}
                      onChange={(e) =>
                        setDefinition({
                          ...definition,
                          kind: e.target.value as GoalDefinition["kind"],
                          unit: e.target.value === "ratio" ? "%" : definition.unit,
                          parent_id: null,
                        })
                      }
                    >
                      <option value="sum">累计量</option>
                      <option value="count">人数 / 数量</option>
                      <option value="ratio">比率门槛（ROI）</option>
                    </select>
                  </label>
                  <label>
                    目标值（{definition.unit}，留空为待设置）
                    <input
                      aria-label="目标值"
                      type="number"
                      min="0"
                      step={definition.kind === "count" ? "1" : "any"}
                      value={definition.target ?? ""}
                      onChange={(e) =>
                        setDefinition({
                          ...definition,
                          target: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    单位
                    <input
                      value={definition.unit}
                      onChange={(e) => setDefinition({ ...definition, unit: e.target.value })}
                    />
                  </label>
                  {!definition.period.includes("Q") && (
                    <label className={styles.full}>
                      关联季度目标
                      <select
                        value={definition.parent_id ?? ""}
                        onChange={(e) =>
                          setDefinition({ ...definition, parent_id: e.target.value || null })
                        }
                      >
                        <option value="">不关联</option>
                        {quartersFor(definition).map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.period} · {g.project} · {g.metric} {fmt(g.target, g.unit)}
                          </option>
                        ))}
                      </select>
                      <span className={styles.muted}>
                        {quartersFor(definition).length
                          ? "关联后校验月度目标分配总额，季度实际值按季度独立统计。"
                          : "暂无对应季度目标。请先新建本月所在季度、相同项目、部门、负责人和指标的季度目标，再回来关联。"}
                      </span>
                    </label>
                  )}
                  <label className={styles.full}>
                    统计口径 / 账号范围 / 完成节点
                    <textarea
                      value={definition.definition}
                      onChange={(e) => setDefinition({ ...definition, definition: e.target.value })}
                    />
                  </label>
                </>
              )}
              <label className={`${styles.full} ${styles.check}`}>
                <input
                  type="checkbox"
                  checked={definition.confirmed}
                  onChange={(e) => setDefinition({ ...definition, confirmed: e.target.checked })}
                />
                已核对全部负责人、统计口径与账号范围
              </label>
              <p className={`${styles.muted} ${styles.full}`}>
                绑定标准指标后自动读取实际值；人工指标需自行填报。修改口径会重新统计，只调整目标值不会修改数据。
                {definition.period.includes("Q") &&
                  " 季度口径与负责人调整会同步到已关联月目标，并为每条目标单独记录。"}
              </p>
            </div>
          )}
          {mode === "progress" && selected && (
            <div className={styles.form}>
              <p className={`${styles.muted} ${styles.full}`}>{selected.definition}</p>
              {!selected.confirmed && (
                <p className={`${styles.warning} ${styles.full}`}>
                  请先完善并确认统计口径与负责人后再填报。
                </p>
              )}
              <label>
                实际值（{selected.unit}）
                <input
                  aria-label="实际值"
                  type="number"
                  min="0"
                  step={selected.kind === "count" ? "1" : "any"}
                  value={actual}
                  onChange={(e) => setActual(e.target.value)}
                />
              </label>
              <label>
                数据截至日
                <input
                  type="date"
                  aria-label="数据截至日"
                  value={asOf}
                  max={businessDate()}
                  onChange={(e) => setAsOf(e.target.value)}
                />
              </label>
              <label className={styles.full}>
                统计依据
                <textarea
                  aria-label="统计依据"
                  placeholder="例如：核对的报表、日期区间、账号范围或统计记录链接"
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                />
              </label>
              <p className={`${styles.muted} ${styles.full}`}>
                填本周期累计实际值；留空表示撤回当前完成数。季度实际不自动相加月度值。
              </p>
            </div>
          )}
          {mode === "action" && selected && groupSelection.length > 0 && (
            <div className={styles.detail}>
              <p>
                确认归档以下{groupSelection.filter((g) => g.status === "published").length}
                项已发布指标？关联的个人目标会同步归档，归档后保留历史记录，停止填报并从首页移除。
              </p>
              <ul>
                {groupSelection
                  .filter((g) => g.status === "published")
                  .map((g) => (
                    <li key={g.id}>
                      {g.metric} · {fmt(g.target, g.unit)}
                    </li>
                  ))}
              </ul>
              {groupSelection.some((g) => g.status === "draft") && (
                <p>
                  以下草稿保留：
                  {groupSelection
                    .filter((g) => g.status === "draft")
                    .map((g) => g.metric)
                    .join("、")}
                  。
                </p>
              )}
            </div>
          )}
          {mode === "action" && selected && !groupSelection.length && (
            <p className={styles.detail}>
              {action === "publish-children"
                ? "团队指标已经发布。本次仅发布该指标下待确认的个人目标，已发布个人目标保持原状态。"
                : action === "publish"
                  ? "发布后将在工作台对应周期展示。未确定的口径、负责人或目标仍会明确标为待配置。"
                  : action === "close"
                    ? "归档后保留历史记录，停止填报并从首页移除。"
                    : action === "refresh-accounts"
                      ? "确认按当前运营经纪人记录更新本指标的账号范围？更新后将重新统计当前目标周期的全部数据，并保留调整记录；同组其他指标仍保留各自范围。"
                      : action === "delete"
                        ? "确认删除该目标？关联的个人目标会同步删除。删除后将从目标列表和工作台移除，保留操作记录供追溯。请填写删除原因；删除后无法通过“开启”恢复。"
                        : "重新开启后恢复已发布状态，并可继续填报。"}
            </p>
          )}
          {mode === "action" &&
            selected &&
            !groupSelection.length &&
            (action === "publish" || action === "publish-children") &&
            publicationChildren.length > 0 && (
              <div className={styles.publicationPanel}>
                {action === "publish" ? (
                  <label className={styles.publicationChoice}>
                    <input
                      type="checkbox"
                      checked={publishChildren}
                      disabled={busy}
                      onChange={(e) => setPublishChildren(e.target.checked)}
                    />
                    <span>
                      <strong>同时发布下属个人目标</strong>
                      <small>
                        仅包含“{selected.metric}”下的 {publicationChildren.length}{" "}
                        项待确认目标；取消勾选则只发布团队指标。
                      </small>
                    </span>
                  </label>
                ) : (
                  <strong>待发布个人目标 · {publicationChildren.length} 项</strong>
                )}
                {(publishChildren || action === "publish-children") && (
                  <>
                    <div className={styles.publicationList}>
                      {publicationChildren.map((g) => (
                        <div key={g.id}>
                          <span>{people(g)}</span>
                          <strong>{fmt(g.target, g.unit)}</strong>
                        </div>
                      ))}
                    </div>
                    <p className={styles.muted}>
                      请核对以上分配。发布时固定各运营账号范围；任一目标校验失败，本次全部不发布。
                    </p>
                  </>
                )}
              </div>
            )}
          {(mode === "edit" || mode === "progress" || mode === "action") && (
            <>
              {mode === "action" && action === "refresh-accounts" && (
                <div className={styles.metricNote}>
                  <p>
                    原固定范围 {selected?.binding?.account_ids.length ?? 0} 个账号；当前匹配{" "}
                    {sourceOptions.data?.accounts.filter(
                      (a) =>
                        a.operator_ids?.length === 1 &&
                        a.operator_ids.some((id) => definition.owner_ids.includes(id)),
                    ).length ?? 0}{" "}
                    个账号。
                  </p>
                  {sourceOptions.status === "loading" && <p>正在读取当前归属…</p>}
                  {sourceOptions.error && <p className={styles.error}>{sourceOptions.error}</p>}
                  <ul className={styles.missingAccounts}>
                    {sourceOptions.data?.accounts
                      .filter(
                        (a) =>
                          a.operator_ids?.length === 1 &&
                          a.operator_ids.some((id) => definition.owner_ids.includes(id)),
                      )
                      .map((a) => (
                        <li key={a.id}>
                          {a.name}
                          {!selected?.binding?.account_ids.includes(a.id) ? " · 新增" : ""}
                        </li>
                      ))}
                  </ul>
                  <p className={styles.muted}>
                    原范围中不再属于该运营的账号将移出。请核对名单后确认。
                  </p>
                </div>
              )}
              <label className={styles.form} style={{ display: "flex", flexDirection: "column" }}>
                操作原因
                <input
                  aria-label="操作原因"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="用于保留本次调整记录"
                />
              </label>
              <div className={styles.actions} style={{ justifyContent: "flex-end", marginTop: 18 }}>
                <button className={styles.button} disabled={busy} onClick={() => setMode(null)}>
                  取消
                </button>
                <button
                  className={
                    mode === "action" && action === "delete" ? styles.danger : styles.primary
                  }
                  disabled={
                    busy ||
                    (mode === "action" &&
                      action === "refresh-accounts" &&
                      sourceOptions.status !== "ready") ||
                    (mode === "edit" &&
                      !independentDefinitions &&
                      !!definition.binding &&
                      sourceOptions.status !== "ready")
                  }
                  onClick={submit}
                >
                  {busy
                    ? "保存中…"
                    : mode === "edit"
                      ? selected
                        ? "保存调整"
                        : "保存草稿"
                      : mode === "progress"
                        ? "保存进度"
                        : actionLabel[action]}
                </button>
              </div>
            </>
          )}
          {mode === "detail" && selected && (
            <>
              <GoalDetailContent
                key={selected.id}
                goal={selected}
                items={data.items}
                departments={data.departments}
                people={people}
                allocation={allocation}
              />
              <div className={styles.actions}>
                {!selected.read_only && (
                  <button className={styles.button} onClick={() => void showHistory(selected)}>
                    查看调整记录
                  </button>
                )}
                {!selected.read_only &&
                  selected.binding?.selection === "operators" &&
                  selected.status === "published" &&
                  data.access.publish && (
                    <button
                      className={styles.button}
                      onClick={() => open("action", selected, "refresh-accounts")}
                    >
                      更新归属账号范围
                    </button>
                  )}
                {!selected.read_only && data.access.fill && (
                  <button
                    className={styles.button}
                    title="可修改周期，完成数和发布状态不会复制"
                    onClick={() => copyGoal(selected)}
                  >
                    复制为新目标
                  </button>
                )}
              </div>
            </>
          )}
          {mode === "history" && (
            <div className={styles.detail}>
              {busy
                ? "正在加载记录…"
                : !history.length
                  ? "暂无当前权限范围内的记录"
                  : history.map((r) => (
                      <div className={styles.revision} key={r.id}>
                        <strong>
                          {actionLabel[r.action] ?? r.action} · {r.actor_name}
                        </strong>
                        <p className={styles.muted}>
                          {new Date(r.created_at).toLocaleString("zh-CN")} · {r.reason}
                        </p>
                        <div className={styles.changes}>{revisionsText(r)}</div>
                      </div>
                    ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
