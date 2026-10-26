"use client";

import { formatGoalValue, type Goal } from "@/modules/goals";
import { periodBounds } from "@/modules/goals/rules";
import { BuyuProductDetails } from "./buyu-product-details";
import styles from "./goals.module.css";

export function GoalPreviewValue({
  goal,
  label,
  compact = false,
}: {
  goal: Goal;
  label: string;
  compact?: boolean;
}) {
  const partial = goal.source_result?.status === "partial";
  const bounds = periodBounds(goal.period);
  return (
    <div className={styles.previewValue} aria-label={label} title={goal.source_result?.note}>
      <span>
        {label} <small>（{goal.period}）</small>
      </span>
      <strong>
        {goal.actual === null ? "暂不可统计" : formatGoalValue(goal.actual, goal.unit)}
      </strong>
      {partial && <small className={styles.error}>部分数据 · 待核对</small>}
      <small>{compact ? "" : `${bounds.start} — ${bounds.end}`}</small>
      {goal.as_of && <small>数据截至 {goal.as_of}</small>}
      {compact ? (
        goal.actual === null && <small>{goal.source_result?.note}</small>
      ) : (
        <>
          <p>{goal.source_result?.note}</p>
          <BuyuProductDetails goal={goal} />
          {(
            [
              [goal.source_result?.missing_accounts, "待核对指标数据的账号"],
              [goal.source_result?.no_record_accounts, "本期无记录账号（按0计入）"],
            ] as const
          ).map(([accounts, text]) =>
            accounts?.length ? (
              <details key={text} open={text.startsWith("待核对")}>
                <summary>
                  {text} · {accounts.length}个
                </summary>
                <ul className={styles.missingAccounts}>
                  {accounts.map((account) => (
                    <li key={account.id}>
                      {account.name}
                      <span className={styles.muted}>（{account.id}）</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null,
          )}
        </>
      )}
    </div>
  );
}
