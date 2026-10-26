"use client";

import { Fragment, useState, type ReactNode } from "react";
import {
  Activity,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  GitBranch,
} from "lucide-react";
import {
  BUYU_TOTAL_PRODUCT,
  formatGoalValue as fmt,
  goalProgress,
  type Goal,
  type GoalList,
} from "@/modules/goals";
import { groupGoals, type GoalGroup } from "@/modules/goals/presentation";
import { supportsTeamSplit, sameTeamMetric } from "@/modules/goals/team-allocation";
import { GoalMetricProgress } from "./goal-metric-progress";
import { GoalCompositeProgress } from "./goal-composite-progress";
import { GoalOperatorsSummary } from "./goal-operators-summary";
import { goalMetricWeights } from "@/modules/goals/weights";
import { pendingTeamMetricGoals } from "@/modules/goals/team-publication";
import styles from "./goals.module.css";

const statusLabel = { draft: "草稿", published: "已发布", closed: "已归档" };
const weightColors = ["#8589d6", "#69a8a0", "#c39b60", "#8ba3c4", "#b18ab9"];

export function GoalGroupsTable({
  items,
  allItems,
  access,
  departments,
  people,
  allocation,
  onOpen,
  onGroupOpen,
  onSplit,
  readOnly = false,
}: {
  onGroupOpen?: (mode: "edit" | "close", goals: Goal[]) => void;
  onSplit?: (goals: Goal[]) => void;
  readOnly?: boolean;
  items: Goal[];
  allItems: Goal[];
  access: GoalList["access"];
  departments: GoalList["departments"];
  people: (goal: Goal) => string;
  allocation: (goal: Goal) => string;
  onOpen?: (mode: "detail" | "progress" | "edit" | "action", goal: Goal, action?: string) => void;
}) {
  const groups = groupGoals(items);
  const [open, setOpen] = useState<Set<string>>(new Set());
  function toggle(key: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  const fullGroups = groupGoals(allItems);
  const groupForId = new Map(
    fullGroups.flatMap((group) => group.items.map((g) => [g.id, group.key] as const)),
  );
  const children = new Map<string, GoalGroup[]>();
  const roots: GoalGroup[] = [];
  for (const group of groups) {
    const parentId = group.items[0]?.team_parent_id;
    const parentKey = parentId ? groupForId.get(parentId) : null;
    const parent = parentKey ? groups.find((g) => g.key === parentKey) : undefined;
    const linked = parent
      ? group.items.filter((goal) => parent.items.some((team) => sameTeamMetric(team, goal)))
      : [];
    if (parentKey && linked.length) {
      children.set(parentKey, [...(children.get(parentKey) ?? []), ...groupGoals(linked)]);
    }
    roots.push(...groupGoals(group.items.filter((goal) => !linked.includes(goal))));
  }
  function renderMetric(goal: Goal, group: GoalGroup, personal = false): ReactNode {
    const progress = goalProgress(goal);
    const metricChildren = (children.get(group.key) ?? []).flatMap((child) =>
      child.items.filter((g) => sameTeamMetric(g, goal)).map((g) => ({ goal: g, group: child })),
    );
    const expanded = open.has(`metric:${goal.id}`);
    const teamIds = new Set(
      (fullGroups.find((g) => g.key === group.key)?.items ?? group.items).map((g) => g.id),
    );
    const pendingChildren = personal
      ? []
      : pendingTeamMetricGoals(
          goal,
          fullGroups.find((g) => g.key === group.key)?.items ?? group.items,
          allItems,
        );
    const assigned = allItems
      .filter(
        (g) =>
          g.team_parent_id &&
          teamIds.has(g.team_parent_id) &&
          g.status !== "closed" &&
          !g.deleted_at &&
          sameTeamMetric(g, goal),
      )
      .reduce((sum, g) => sum + (g.target ?? 0), 0);
    const allocationPercent =
      goal.target && goal.target > 0 ? Math.round((assigned / goal.target) * 100) : 0;
    const remaining = Math.max(0, (goal.target ?? 0) - assigned);
    const fullyAllocated = goal.target !== null && goal.target > 0 && remaining <= 1e-8;
    const publicationLabel =
      goal.team_parent_id && goal.status === "draft" ? "待负责人确认" : statusLabel[goal.status];
    return (
      <Fragment key={goal.id}>
        <tr className={personal ? styles.operatorMetricRow : undefined}>
          <td>
            <div className={styles.metricIdentity}>
              {metricChildren.length ? (
                <button
                  className={styles.metricToggle}
                  aria-expanded={expanded}
                  aria-label={`${expanded ? "收起" : "展开"}${goal.metric}运营明细`}
                  onClick={() => toggle(`metric:${goal.id}`)}
                >
                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <strong>{goal.metric}</strong>
                </button>
              ) : (
                <strong>{personal ? people(goal) : goal.metric}</strong>
              )}
              <span
                className={`${styles.publicationStatus} ${goal.status === "published" ? styles.publicationActive : goal.status === "draft" ? styles.publicationDraft : styles.publicationClosed}`}
                role="img"
                aria-label={publicationLabel}
                title={publicationLabel}
              >
                <i aria-hidden="true" />
                {goal.status !== "published" && <span>{publicationLabel}</span>}
              </span>
            </div>
          </td>
          <td className={styles.number}>
            {fmt(goal.target, goal.unit)}
            {!goal.read_only &&
              supportsTeamSplit(goal) &&
              goal.target !== null &&
              goal.target > 0 && (
                <div
                  className={`${styles.allocationSummary} ${fullyAllocated ? styles.allocationComplete : ""}`}
                  title={`已分配 ${fmt(assigned, goal.unit)}，剩余 ${fmt(remaining, goal.unit)}`}
                >
                  <div
                    className={styles.allocationTrack}
                    role="progressbar"
                    aria-label={`${goal.metric}个人目标分配进度`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.min(100, allocationPercent)}
                    aria-valuetext={`已分配 ${fmt(assigned, goal.unit)}，剩余 ${fmt(remaining, goal.unit)}`}
                  >
                    <i style={{ width: `${Math.min(100, allocationPercent)}%` }} />
                  </div>
                  <div className={styles.allocationCaption}>
                    {fullyAllocated ? (
                      <Check size={12} aria-hidden="true" />
                    ) : (
                      <GitBranch size={12} aria-hidden="true" />
                    )}
                    <span>{fullyAllocated ? "分配完成" : `已分配 ${allocationPercent}%`}</span>
                    {!fullyAllocated && (
                      <span className={styles.allocationRemainder}>
                        余 {fmt(remaining, goal.unit)}
                      </span>
                    )}
                  </div>
                </div>
              )}
            {allocation(goal) && <div className={styles.muted}>{allocation(goal)}</div>}
          </td>
          <td>
            <span className={goal.actual === null ? styles.muted : styles.number}>
              {goal.source_result?.status === "partial" && "已同步 "}
              {goal.actual === null
                ? goal.binding
                  ? "待同步"
                  : "待填报"
                : fmt(goal.actual, goal.unit)}
            </span>
            <div className={styles.muted}>{goal.as_of ?? "—"}</div>
          </td>
          <td>
            <GoalMetricProgress goal={goal} />
          </td>
          <td>
            <span className={progress.attention ? styles.warning : styles.muted}>
              {progress.label}
            </span>
          </td>
          <td>
            <div className={styles.actions}>
              {readOnly || goal.read_only ? (
                <button className={styles.link} onClick={() => onOpen?.("detail", goal)}>
                  查看详情
                </button>
              ) : (
                <>
                  <button className={styles.link} onClick={() => onOpen?.("detail", goal)}>
                    详情
                  </button>
                  {access.fill && !goal.binding && goal.status !== "closed" && (
                    <button className={styles.link} onClick={() => onOpen?.("progress", goal)}>
                      填报
                    </button>
                  )}
                  {personal &&
                  !!group.current.length &&
                  group.current.every((g) =>
                    g.status === "draft" ? access.fill : access.publish,
                  ) ? (
                    <button
                      className={styles.link}
                      onClick={() => onGroupOpen?.("edit", group.current)}
                    >
                      调整个人目标
                    </button>
                  ) : (
                    !group.current.every((g) =>
                      g.status === "draft" ? access.fill : access.publish,
                    ) &&
                    ((goal.status === "draft" && access.fill) ||
                      (goal.status === "published" && access.publish)) && (
                      <button className={styles.link} onClick={() => onOpen?.("edit", goal)}>
                        调整
                      </button>
                    )
                  )}
                  {access.publish && goal.status !== "published" && (
                    <button
                      className={styles.link}
                      onClick={() =>
                        onOpen?.("action", goal, goal.status === "draft" ? "publish" : "reopen")
                      }
                    >
                      {goal.status === "draft" ? "发布" : "开启"}
                    </button>
                  )}
                  {access.publish &&
                    access.canManageTeam &&
                    goal.status === "published" &&
                    pendingChildren.length > 0 && (
                      <button
                        className={styles.link}
                        onClick={() => onOpen?.("action", goal, "publish-children")}
                      >
                        发布个人目标（{pendingChildren.length}）
                      </button>
                    )}
                  {((goal.status === "draft" && access.fill) ||
                    (goal.status !== "draft" && access.publish)) && (
                    <button
                      className={`${styles.link} ${styles.dangerLink}`}
                      onClick={() => onOpen?.("action", goal, "delete")}
                    >
                      删除
                    </button>
                  )}
                </>
              )}
            </div>
          </td>
        </tr>
        {expanded && metricChildren.map((child) => renderMetric(child.goal, child.group, true))}
      </Fragment>
    );
  }
  function renderGroup(group: GoalGroup): ReactNode {
    const first = group.items[0];
    if (!first) return null;
    const expanded = open.has(group.key);
    const weights = goalMetricWeights(group.current);
    const department = departments.find((d) => d.id === first.dept_id)?.name ?? "未指定 / 跨部门";
    const heading = `${group.project} / ${department} · ${people(first)}`;
    return (
      <Fragment key={group.key}>
        <tbody>
          <tr className={styles.groupHeader}>
            <td>
              <button
                className={styles.groupToggle}
                aria-expanded={expanded}
                aria-label={`${expanded ? "收起" : "展开"}${heading}`}
                onClick={() => toggle(group.key)}
              >
                {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span>
                  <strong>
                    {first.binding?.source === "buyu" &&
                    first.binding.product === BUYU_TOTAL_PRODUCT
                      ? "捕鱼总盘"
                      : group.project}{" "}
                    <span className={styles.goalLevel}>
                      {first.team_parent_id || first.binding?.selection === "operators"
                        ? "个人目标"
                        : "团队目标"}
                    </span>
                  </strong>
                  <span className={styles.muted}>{department}</span>
                </span>
              </button>
            </td>
            <td>{people(first)}</td>
            <td>
              {group.current.length ? (
                <div className={styles.groupSummary}>
                  <GoalCompositeProgress items={group.current} compact />
                  <ul className={styles.groupIndicators} aria-label={`${heading}指标及权重`}>
                    {group.current.map((goal, index) => (
                      <li
                        className={styles.groupIndicator}
                        key={goal.id}
                        title={`${goal.metric} · 权重 ${Number((weights[index] ?? 0).toFixed(2))}%`}
                      >
                        <i
                          className={styles.weightSwatch}
                          style={{ backgroundColor: weightColors[index % weightColors.length] }}
                          aria-hidden="true"
                        />
                        <span>{goal.metric}</span>
                        <strong>{Number((weights[index] ?? 0).toFixed(2))}%</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <span className={styles.muted}>指标已归档，展开查看历史</span>
              )}
            </td>
            <td>
              {group.current.length ? (
                <>
                  <div className={styles.groupStatus}>
                    <span
                      className={`${styles.followIcon} ${group.attention ? styles.followAttention : ""}`}
                      role="img"
                      title={group.attention ? `${group.attention}项需关注` : "正常跟进"}
                      aria-label={group.attention ? `${group.attention}项需关注` : "正常跟进"}
                    >
                      {group.attention ? (
                        <CircleAlert size={16} aria-hidden="true" />
                      ) : (
                        <Activity size={16} aria-hidden="true" />
                      )}
                      {group.attention > 0 && <small>{group.attention}</small>}
                    </span>
                    <span
                      className={`${styles.achievedCount} ${group.achieved === group.current.length ? styles.achievedAll : ""}`}
                      role="img"
                      title={`已达成 ${group.achieved} 项，共 ${group.current.length} 项指标`}
                      aria-label={`已达成 ${group.achieved} 项，共 ${group.current.length} 项指标`}
                    >
                      <CircleCheck size={15} aria-hidden="true" />
                      <strong>
                        {group.achieved}
                        <span> / {group.current.length}</span>
                      </strong>
                    </span>
                  </div>
                  {readOnly && (
                    <GoalOperatorsSummary
                      title={`${group.project} / ${department}`}
                      groups={children.get(group.key) ?? []}
                      people={people}
                    />
                  )}
                </>
              ) : (
                <span className={styles.badge}>已归档</span>
              )}
            </td>
            {!readOnly && (
              <td>
                <div className={styles.actions}>
                  {access.fill &&
                    !first.read_only &&
                    access.canManageTeam &&
                    !first.team_parent_id &&
                    group.current.length > 0 &&
                    group.current.every((g) => supportsTeamSplit(g) && g.target !== null) && (
                      <button
                        className={styles.link}
                        onClick={() => {
                          setOpen((current) => new Set([...current, group.key]));
                          onSplit?.(group.current);
                        }}
                      >
                        拆分目标
                      </button>
                    )}
                  {!!group.current.length &&
                    !first.read_only &&
                    group.current.every((g) =>
                      g.status === "draft" ? access.fill : access.publish,
                    ) && (
                      <button
                        className={styles.link}
                        onClick={() => onGroupOpen?.("edit", group.current)}
                      >
                        调整
                      </button>
                    )}
                  {!first.read_only &&
                    access.publish &&
                    group.current.some((g) => g.status === "published") && (
                      <button
                        className={styles.link}
                        onClick={() => onGroupOpen?.("close", group.current)}
                      >
                        归档
                      </button>
                    )}
                  <GoalOperatorsSummary
                    title={`${group.project} / ${department}`}
                    groups={children.get(group.key) ?? []}
                    people={people}
                    onGroupOpen={onGroupOpen}
                    access={access}
                  />
                  <button className={styles.link} onClick={() => toggle(group.key)}>
                    {expanded ? "收起" : "展开指标"}
                  </button>
                </div>
              </td>
            )}
          </tr>
          {expanded && (
            <tr>
              <td colSpan={readOnly ? 4 : 5} className={styles.groupDetailCell}>
                <div className={styles.tableWrap}>
                  <table
                    className={`${styles.table} ${styles.groupDetailTable}`}
                    aria-label={`${heading}指标明细`}
                  >
                    <thead>
                      <tr>
                        {["指标", "目标", "实际 / 截至日", "完成进度", "跟进状态", "操作"].map(
                          (label) => (
                            <th key={label}>{label}</th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>{group.items.map((goal) => renderMetric(goal, group))}</tbody>
                  </table>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </Fragment>
    );
  }
  return (
    <div>
      {!!groups.length && !readOnly && (
        <div className={styles.groupToolbar}>
          <span className={styles.muted}>
            {roots.length}组目标 ·{" "}
            {[...children.values()].reduce((sum, list) => sum + list.length, 0)}组个人拆分 ·{" "}
            {items.length}项指标
          </span>
          <div className={styles.actions}>
            <button
              className={styles.link}
              onClick={() =>
                setOpen(
                  new Set([...groups.map((g) => g.key), ...items.map((g) => `metric:${g.id}`)]),
                )
              }
            >
              全部展开
            </button>
            <button className={styles.link} onClick={() => setOpen(new Set())}>
              全部收起
            </button>
          </div>
        </div>
      )}
      <div className={styles.tableWrap}>
        <table
          className={`${styles.table} ${styles.groupTable} ${readOnly ? styles.workbenchGoalsTable : ""}`}
          aria-label={readOnly ? "本月目标分组" : "目标分组"}
        >
          {readOnly && (
            <colgroup>
              <col style={{ width: "25%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "41%" }} />
              <col style={{ width: "20%" }} />
            </colgroup>
          )}
          <thead>
            <tr>
              {(readOnly
                ? ["项目 / 部门", "负责人", "指标进度", "跟进状态"]
                : ["项目 / 部门", "负责人", "指标进度", "跟进状态", "操作"]
              ).map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          {roots.map((group) => renderGroup(group))}
        </table>
      </div>
    </div>
  );
}
