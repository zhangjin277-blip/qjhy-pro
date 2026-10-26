"use client";

import { formatGoalValue, type Goal } from "@/modules/goals";
import { BuyuQualificationDetails } from "./buyu-qualification-details";
import styles from "./goals.module.css";

/** Uses only rows already resolved through the goal's account and data permissions. */
export function BuyuProductDetails({ goal }: { goal: Goal }) {
  if (
    goal.binding?.source === "buyu" &&
    goal.binding.field === "qualified_accounts" &&
    goal.source_result?.account_progress?.length
  )
    return <BuyuQualificationDetails goal={goal} />;
  const details = goal.source_result?.product_details;
  if (!details?.length) return null;
  return (
    <details className={styles.metricNote}>
      <summary>按产品查看完成明细</summary>
      <div className={styles.productDetails}>
        {details.map((product) => (
          <details key={product.product}>
            <summary>
              <strong>{product.name}</strong>
              <span>
                {product.actual === null
                  ? "暂无完整数据"
                  : formatGoalValue(product.actual, goal.unit)}
              </span>
            </summary>
            <p className={styles.muted}>{product.note}</p>
            {product.accounts.map((account) => (
              <div className={styles.productAccount} key={account.id} title={account.note}>
                <span>{account.name}</span>
                <strong>
                  {account.actual === null ? "待核对" : formatGoalValue(account.actual, goal.unit)}
                </strong>
              </div>
            ))}
          </details>
        ))}
      </div>
    </details>
  );
}
