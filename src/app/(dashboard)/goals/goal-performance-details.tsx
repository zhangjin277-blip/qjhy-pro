"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { formatGoalValue, type Goal } from "@/modules/goals";
import { BuyuProductDetails } from "./buyu-product-details";
import styles from "./goals.module.css";

const percent = (value: number) => `${Number(value.toFixed(2))}%`;

/** Goal-level progress only: accounts have contributions, not invented individual targets. */
export function GoalPerformanceDetails({ goal }: { goal: Goal }) {
  const complete = goal.confirmed && (!goal.binding || goal.source_result?.status === "ready");
  const known = complete && goal.actual !== null && goal.target !== null;
  const actual = goal.actual ?? 0;
  const target = goal.target ?? 0;
  const upper = goal.binding?.direction === "lte";
  const met = known && (upper ? actual <= target : actual >= target);
  const gap = known ? Math.max(0, upper ? actual - target : target - actual) : null;
  const rate = known && target > 0 ? (actual / target) * 100 : null;
  const state = !goal.confirmed
    ? "待配置"
    : goal.source_result?.status === "partial"
      ? "部分数据"
      : !known
        ? goal.binding
          ? "待同步"
          : "待填报"
        : upper
          ? met
            ? "符合上限"
            : "已超上限"
          : met
            ? "已达成"
            : "进行中";
  const number = (value: number | null) =>
    value === null ? "—" : formatGoalValue(value, goal.unit);
  const qualification =
    goal.binding?.source === "buyu" && goal.binding.field === "qualified_accounts";
  return (
    <>
      <section className={styles.performanceOverview} aria-label="目标完成概览">
        <div className={styles.performanceTitle}>
          <h3>{goal.metric}</h3>
          <span
            className={`${styles.accountStatus} ${met ? styles.accountQualified : known ? styles.accountUnqualified : styles.accountPending}`}
          >
            {state}
          </span>
        </div>
        <div className={styles.performanceNumbers}>
          <div>
            <span>{goal.source_result?.status === "partial" ? "已同步实际" : "当前实际"}</span>
            <strong>{number(goal.actual)}</strong>
          </div>
          <div>
            <span>{upper ? "目标上限" : "目标值"}</span>
            <strong>{number(goal.target)}</strong>
          </div>
          <div>
            <span>{upper ? "超出上限" : "距目标还差"}</span>
            <strong>
              {gap === null
                ? "—"
                : goal.unit === "%"
                  ? `${Number(gap.toFixed(3))} 个百分点`
                  : number(gap)}
            </strong>
          </div>
          <div>
            <span>{upper ? "额度使用" : goal.unit === "%" ? "门槛进度" : "完成进度"}</span>
            <strong className={styles.performanceRate}>
              {rate === null ? (known && met ? "已达成" : "—") : percent(rate)}
            </strong>
          </div>
        </div>
        {rate !== null && (
          <div
            className={styles.accountProgressBar}
            role="progressbar"
            aria-label={upper ? "目标额度使用" : "目标完成进度"}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.max(0, rate))}
            aria-valuetext={percent(rate)}
          >
            <i
              className={
                met ? styles.accountMetBar : upper ? styles.performanceWarningBar : undefined
              }
              style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
            />
          </div>
        )}
        <div className={styles.performanceFooter}>
          <span>{goal.as_of ? `数据截至 ${goal.as_of}` : "暂无统计日期"}</span>
          {goal.source_result?.status === "partial" && <span>当前为部分合计，暂不判断达成</span>}
        </div>
      </section>
      {qualification ? (
        <BuyuProductDetails goal={goal} />
      ) : (
        <AccountValues key={goal.id} goal={goal} />
      )}
    </>
  );
}

function AccountValues({ goal }: { goal: Goal }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const allRows = goal.source_result?.account_values ?? [];
  const contribution = goal.source_result?.account_values_additive === true;
  const accountTargets = goal.binding?.account_targets;
  const hasAccountTargets =
    goal.binding?.source === "buyu" && goal.binding.field === "消耗" && !!accountTargets;
  // Hide confirmed zero contributions; unknown data and non-additive zero values remain meaningful.
  const rows = allRows.filter((account) => !contribution || account.actual !== 0);
  if (!allRows.length) return null;
  const total = goal.actual ?? 0;
  const accountActualTotals = new Map<string, number>();
  for (const row of allRows) {
    if (row.actual !== null)
      accountActualTotals.set(row.id, (accountActualTotals.get(row.id) ?? 0) + row.actual);
  }
  const sharesReady =
    contribution &&
    goal.source_result?.status === "ready" &&
    goal.actual !== null &&
    goal.actual > 0;
  const visible = rows
    .filter(
      (a) =>
        (filter === "all" || a.status === filter) &&
        `${a.name} ${a.id} ${a.product_name ?? ""}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    )
    .sort(
      (a, b) =>
        (b.actual ?? -Infinity) - (a.actual ?? -Infinity) || a.name.localeCompare(b.name, "zh-CN"),
    );
  const filters = [
    ["all", "全部"],
    ["ready", "有数据"],
    ["no_record", "本期无记录"],
    ["pending", "待确认"],
  ] as const;
  return (
    <section className={styles.accountProgressSection} aria-label="账号完成明细">
      <div className={styles.accountProgressHeading}>
        <div>
          <h3>账号完成明细</h3>
          <p>
            {goal.metric}
            {hasAccountTargets
              ? " · 按账号目标完成度查看"
              : contribution
                ? " · 按实际贡献排序"
                : " · 按当前值排序"}
          </p>
        </div>
        <label className={styles.accountProgressSearch}>
          <Search size={14} aria-hidden="true" />
          <input
            aria-label="搜索完成明细账号"
            placeholder="搜索账号或产品"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className={styles.accountProgressFilters} role="group" aria-label="筛选账号数据状态">
        {filters
          .filter(([id]) => id === "all" || rows.some((a) => a.status === id))
          .map(([id, label]) => (
            <button
              type="button"
              key={id}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
              <span>{id === "all" ? rows.length : rows.filter((a) => a.status === id).length}</span>
            </button>
          ))}
      </div>
      <div className={styles.accountProgressScroll}>
        <table className={`${styles.accountProgressTable} ${styles.metricValuesTable}`}>
          <thead>
            <tr>
              <th>账号 / 产品</th>
              <th>当前实际</th>
              {hasAccountTargets ? (
                <>
                  <th>账号目标</th>
                  <th>完成度</th>
                </>
              ) : (
                contribution && <th>贡献占比</th>
              )}
              <th>状态 / 更新日期</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((account) => {
              const share =
                sharesReady && account.actual !== null && account.actual >= 0
                  ? (account.actual / total) * 100
                  : null;
              const targetValue = hasAccountTargets ? (accountTargets?.[account.id] ?? null) : null;
              const accountActual = accountActualTotals.get(account.id) ?? null;
              const completion =
                targetValue !== null && targetValue > 0 && accountActual !== null
                  ? (accountActual / targetValue) * 100
                  : null;
              return (
                <tr key={`${account.product ?? ""}:${account.id}`}>
                  <td>
                    <strong>{account.name}</strong>
                    {account.product_name && (
                      <span className={styles.accountProduct}>{account.product_name}</span>
                    )}
                  </td>
                  <td>
                    <strong className={styles.metricValue}>
                      {account.actual === null ? "—" : formatGoalValue(account.actual, goal.unit)}
                    </strong>
                  </td>
                  {hasAccountTargets ? (
                    <>
                      <td>
                        <strong className={styles.metricValue}>
                          {targetValue === null ? "—" : formatGoalValue(targetValue, goal.unit)}
                        </strong>
                      </td>
                      <td>
                        <div className={styles.contributionValue}>
                          <span>{completion === null ? "—" : percent(completion)}</span>
                          {completion !== null && (
                            <div className={styles.accountProgressBar}>
                              <i style={{ width: `${Math.min(100, Math.max(0, completion))}%` }} />
                            </div>
                          )}
                        </div>
                      </td>
                    </>
                  ) : (
                    contribution && (
                    <td>
                      <div className={styles.contributionValue}>
                        <span>{share === null ? "—" : percent(share)}</span>
                        {share !== null && (
                          <div className={styles.accountProgressBar}>
                            <i style={{ width: `${Math.min(100, share)}%` }} />
                          </div>
                        )}
                      </div>
                    </td>
                    )
                  )}
                  <td>
                    <span
                      className={`${styles.accountStatus} ${account.status === "ready" ? styles.accountQualified : account.status === "no_record" ? styles.accountExcluded : styles.accountPending}`}
                    >
                      {account.status === "ready"
                        ? "已同步"
                        : account.status === "no_record"
                          ? "本期无记录"
                          : "待确认"}
                    </span>
                    <small className={styles.accountDate}>
                      {account.as_of ??
                        (account.status === "no_record" ? "按0计入" : "暂无本期数据")}
                    </small>
                    {account.status === "pending" && (
                      <small className={styles.accountPendingNote}>{account.note}</small>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!visible.length && (
          <p className={styles.accountProgressEmpty}>
            {!rows.length ? "本期暂无非零贡献账号" : "暂无符合条件的账号"}
          </p>
        )}
      </div>
    </section>
  );
}
