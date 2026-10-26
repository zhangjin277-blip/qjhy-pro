"use client";

import { formatGoalValue as fmt, type Goal, type GoalList } from "@/modules/goals";
import { GoalPerformanceDetails } from "./goal-performance-details";
import styles from "./goals.module.css";

export function GoalDetailContent({
  goal,
  items,
  departments,
  people,
  allocation = () => "",
}: {
  goal: Goal;
  items: Goal[];
  departments: GoalList["departments"];
  people: (goal: Goal) => string;
  allocation?: (goal: Goal) => string;
}) {
  return (
    <>
      <GoalPerformanceDetails key={goal.id} goal={goal} />
      <dl className={styles.goalMetadata}>
        {[
          ["负责人", people(goal)],
          ["归属部门", departments.find((d) => d.id === goal.dept_id)?.name ?? "未指定"],
          [
            "所属团队",
            goal.team_parent_id
              ? (() => {
                  const team = items.find((g) => g.id === goal.team_parent_id);
                  return team ? `${team.project} · ${people(team)}` : "团队目标不在当前查看范围";
                })()
              : goal.binding?.selection === "operators"
                ? "独立个人目标"
                : "团队目标",
          ],
          ...(goal.parent_id
            ? [
                [
                  "关联季度",
                  items.find((g) => g.id === goal.parent_id)?.period ?? "不在当前查看范围",
                ],
              ]
            : []),
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <details className={styles.metricNote}>
        <summary>统计口径与目标设置</summary>
        <div className={styles.detail}>
          <dl>
            {[
              ["统计口径", goal.definition || "待配置"],
              [
                "数据方式",
                goal.confirmed
                  ? goal.binding
                    ? "自动读取业务数据"
                    : "人工填报"
                  : "待配置 · 请确认指标与统计范围",
              ],
              ["统计依据", goal.source_result?.note || goal.evidence || "未填报"],
              [
                "指标权重",
                goal.weight == null ? "自动平均分配" : `${goal.weight}%（按当前参与范围折算）`,
              ],
              ...(allocation(goal)
                ? [
                    [
                      "月度分配",
                      `${allocation(goal)}\n${items
                        .filter((g) => g.parent_id === goal.id)
                        .map((g) => `${g.period}：${fmt(g.target, g.unit)}`)
                        .join("\n")}\n尚未分配的月份保持未设置，季度实际独立填报。`,
                    ],
                  ]
                : []),
            ].map(([label, value]) => (
              <div style={{ display: "contents" }} key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </details>
      {goal.binding?.selection === "operators" && (
        <details className={styles.metricNote}>
          <summary>
            {goal.binding.account_snapshot_at
              ? `已固定 ${goal.binding.account_ids.length} 个账号`
              : `当前自动匹配 ${goal.source_result?.matched_accounts?.length ?? 0} 个账号`}{" "}
            · 查看名单
          </summary>
          <ul className={styles.missingAccounts}>
            {(
              goal.source_result?.matched_accounts ??
              goal.binding.account_ids.map((id) => ({ id, name: id }))
            ).map((a) => (
              <li key={a.id}>
                {a.name}
                {goal.binding?.account_targets?.[a.id] !== undefined &&
                  ` · 目标 ${fmt(goal.binding.account_targets[a.id] ?? null, goal.unit)}`}
              </li>
            ))}
          </ul>
          <p className={styles.muted}>
            {goal.binding.account_snapshot_at
              ? `范围固定于 ${new Date(goal.binding.account_snapshot_at).toLocaleString("zh-CN")}`
              : "草稿范围随运营归属更新，发布时固定。"}
          </p>
        </details>
      )}
    </>
  );
}
