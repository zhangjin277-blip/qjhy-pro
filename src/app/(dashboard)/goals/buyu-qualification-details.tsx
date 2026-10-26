"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { formatGoalValue, type Goal } from "@/modules/goals";
import type { GoalAccountProgress } from "@/modules/goals/types";
import styles from "./goals.module.css";

const statuses = {
  unqualified: { label: "未达标", className: "accountUnqualified", rank: 0 },
  pending: { label: "待确认", className: "accountPending", rank: 1 },
  qualified: { label: "已达标", className: "accountQualified", rank: 2 },
  excluded: { label: "不统计", className: "accountExcluded", rank: 3 },
} as const;
type Filter = "all" | GoalAccountProgress["status"];
const number = (value: number) => value.toLocaleString("zh-CN", { maximumFractionDigits: 3 });

function ThresholdProgress({
  account,
  metric,
}: {
  account: GoalAccountProgress;
  metric: "roi" | "cost";
}) {
  const current = account[metric];
  const required = metric === "roi" ? account.required_roi : account.required_cost;
  const gap = metric === "roi" ? account.roi_gap : account.cost_gap;
  const label = metric === "roi" ? "实时净ROI" : "消耗";
  const format = (value: number) =>
    metric === "roi" ? `${number(value)}%` : formatGoalValue(value, "元");
  const percent =
    current === null || required === null
      ? null
      : required === 0
        ? current >= 0
          ? 100
          : 0
        : Math.min(100, Math.max(0, (current / required) * 100));
  const noMinimum = metric === "cost" && required === 0;
  return (
    <div className={styles.accountThreshold}>
      <div>
        <strong>{current === null ? "—" : format(current)}</strong>
        <span>
          {required === null
            ? "门槛待配置"
            : noMinimum
              ? "无最低消耗要求"
              : `目标 ≥ ${format(required)}`}
        </span>
      </div>
      {percent !== null && !noMinimum && account.status !== "excluded" && (
        <div
          className={styles.accountProgressBar}
          role="progressbar"
          aria-label={`${account.name}·${account.product_name}·${label}门槛进度`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${label} ${format(current ?? 0)}，目标 ${format(required ?? 0)}`}
        >
          <i
            className={gap === 0 ? styles.accountMetBar : undefined}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      <small className={gap !== null && gap > 0 ? styles.accountGap : styles.muted}>
        {account.status === "excluded"
          ? "不纳入统计"
          : gap === null
            ? "数据待确认"
            : gap > 0
              ? `还差 ${metric === "roi" ? `${number(gap)} 个百分点` : format(gap)}`
              : noMinimum
                ? ""
                : "已达到要求"}
      </small>
    </div>
  );
}

/** Shows the inherited account thresholds, without introducing independently editable account goals. */
export function BuyuQualificationDetails({ goal }: { goal: Goal }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const accounts = goal.source_result?.account_progress ?? [];
  if (!accounts.length) return null;
  const counts = (status: Filter) =>
    accounts.filter((a) => status === "all" || a.status === status).length;
  const visible = accounts
    .filter(
      (a) =>
        (filter === "all" || a.status === filter) &&
        `${a.name} ${a.id} ${a.product_name}`.toLowerCase().includes(search.trim().toLowerCase()),
    )
    .sort(
      (a, b) =>
        statuses[a.status].rank - statuses[b.status].rank ||
        (a.roi_gap ?? Infinity) - (b.roi_gap ?? Infinity) ||
        a.name.localeCompare(b.name, "zh-CN"),
    );
  const duplicated = new Set(accounts.map((a) => a.id)).size < accounts.length;
  const filters: Filter[] = ["all", "unqualified", "qualified", "pending", "excluded"];
  return (
    <section className={styles.accountProgressSection} aria-label="账号达标进度">
      <div className={styles.accountProgressHeading}>
        <div>
          <h3>账号达标进度</h3>
          <p>月汇总实时净ROI与消耗均达到要求，计为达标账号。</p>
        </div>
        <label className={styles.accountProgressSearch}>
          <Search size={14} aria-hidden="true" />
          <input
            aria-label="搜索达标进度账号"
            placeholder="搜索账号或产品"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className={styles.accountProgressFilters} role="group" aria-label="筛选账号状态">
        {filters
          .filter((status) => status !== "excluded" || counts(status) > 0)
          .map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={filter === status}
              onClick={() => setFilter(status)}
            >
              {status === "all" ? "全部" : statuses[status].label}
              <span>{counts(status)}</span>
            </button>
          ))}
      </div>
      <div className={styles.accountProgressScroll}>
        <table className={styles.accountProgressTable}>
          <thead>
            <tr>
              <th>账号 / 产品</th>
              <th>实时净ROI</th>
              <th>本月消耗</th>
              <th>状态 / 更新日期</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((account) => (
              <tr key={`${account.product}:${account.id}`}>
                <td>
                  <strong>{account.name}</strong>
                  <span className={styles.accountProduct}>{account.product_name}</span>
                </td>
                <td>
                  <ThresholdProgress account={account} metric="roi" />
                </td>
                <td>
                  <ThresholdProgress account={account} metric="cost" />
                </td>
                <td>
                  <span
                    className={`${styles.accountStatus} ${styles[statuses[account.status].className]}`}
                    title={account.note}
                  >
                    {statuses[account.status].label}
                  </span>
                  <small className={styles.accountDate}>{account.as_of ?? "暂无本期数据"}</small>
                  {account.status === "pending" && (
                    <small className={styles.accountPendingNote}>{account.note}</small>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && <p className={styles.accountProgressEmpty}>暂无符合条件的账号</p>}
      </div>
      {duplicated && (
        <p className={styles.muted}>同一账号按产品分别列示，达标账号总数按账号去重。</p>
      )}
    </section>
  );
}
