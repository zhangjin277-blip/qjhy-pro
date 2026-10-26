"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Users } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatGoalValue as fmt, type Goal, type GoalList } from "@/modules/goals";
import {
  personalDefinition,
  sameTeamMetric,
  supportsAccountTargetSplit,
} from "@/modules/goals/team-allocation";
import { GoalPreviewValue } from "./goal-preview-value";
import { useSourceOptions } from "./use-source-options";
import styles from "./goals.module.css";

export function GoalSplitDialog({
  goals,
  allItems,
  departments,
  onClose,
  onSaved,
}: {
  goals: Goal[];
  allItems: Goal[];
  departments: GoalList["departments"];
  onClose: () => void;
  onSaved: (count: number) => Promise<void>;
}) {
  const first = goals[0];
  const options = useSourceOptions(first?.binding, first?.dept_id ?? null);
  const [selected, setSelected] = useState<string[]>([]);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [accountTargets, setAccountTargets] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("按团队目标分配个人运营目标");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [preview, setPreview] = useState<Record<string, { goal?: Goal; error?: string }>>({});
  const [previewKey, setPreviewKey] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewController = useRef<AbortController | null>(null);
  const contextKey = JSON.stringify([goals, options.data?.users]);
  useEffect(
    () => () => {
      previewController.current?.abort();
      setPreviewLoading(false);
    },
    [contextKey],
  );
  if (!first) return null;
  const previousLabel = first.period.includes("Q") ? "上季完成" : "上月完成";
  async function loadPrevious() {
    if (!first) return;
    previewController.current?.abort();
    const controller = new AbortController();
    previewController.current = controller;
    setPreviewLoading(true);
    setPreview({});
    setPreviewKey(contextKey);
    const jobs = (options.data?.users ?? []).flatMap((user) =>
      goals.map((goal) => ({ user, goal })),
    );
    for (let i = 0; i < jobs.length && !controller.signal.aborted; i += 4) {
      const entries = await Promise.all(
        jobs.slice(i, i + 4).map(async ({ user, goal }) => {
          const key = `${user.id}:${goal.id}`;
          try {
            const response = await fetch("/api/goals", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller.signal,
              body: JSON.stringify({
                action: "preview",
                mode: "previous",
                definition: personalDefinition(goal, user.id, 0, first.id),
              }),
            });
            const json = await response.json();
            if (!response.ok) throw new Error(json.error || "读取失败");
            return [key, { goal: json.item as Goal }] as const;
          } catch (error) {
            return [key, { error: error instanceof Error ? error.message : "读取失败" }] as const;
          }
        }),
      );
      if (!controller.signal.aborted)
        setPreview((current) => ({ ...current, ...Object.fromEntries(entries) }));
    }
    if (!controller.signal.aborted) setPreviewLoading(false);
  }
  const ids = new Set(goals.map((g) => g.id));
  const existing = allItems.filter(
    (g) => g.team_parent_id && ids.has(g.team_parent_id) && !g.deleted_at && g.status !== "closed",
  );
  const assigned = new Set(existing.flatMap((g) => g.owner_ids));
  const accountsFor = (id: string) =>
    options.data?.accounts.filter(
      (a) => a.operator_ids?.length === 1 && a.operator_ids.includes(id),
    ) ?? [];
  const accountTargetMetric = (goal: Goal) => supportsAccountTargetSplit(goal);
  const accountTargetKey = (ownerId: string, goalId: string, accountId: string) =>
    ownerId + ":" + goalId + ":" + accountId;
  const accountTargetSum = (ownerId: string, goal: Goal) =>
    accountsFor(ownerId).reduce(
      (sum, account) =>
        sum + (Number(accountTargets[accountTargetKey(ownerId, goal.id, account.id)]) || 0),
      0,
    );
  const accountTargetMap = (ownerId: string, goal: Goal) =>
    Object.fromEntries(
      accountsFor(ownerId).map((account) => [
        account.id,
        Number(accountTargets[accountTargetKey(ownerId, goal.id, account.id)]),
      ]),
    );
  const existingFor = (goal: Goal) =>
    existing.filter((g) => sameTeamMetric(g, goal)).reduce((sum, g) => sum + (g.target ?? 0), 0);
  const pendingFor = (goal: Goal) =>
    selected.reduce(
      (sum, id) =>
        sum +
        (accountTargetMetric(goal)
          ? accountTargetSum(id, goal)
          : Number(targets[id + ":" + goal.id]) || 0),
      0,
    );
  const totalFor = (goal: Goal) => existingFor(goal) + pendingFor(goal);
  const overAllocated = goals.some((g) => g.target !== null && totalFor(g) > g.target + 1e-8);
  const availableUsers = options.data?.users.filter((u) => !assigned.has(u.id)) ?? [];
  const allSelected =
    !!availableUsers.length && availableUsers.every((u) => selected.includes(u.id));
  function togglePerson(id: string) {
    setSelected((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
    if (!selected.includes(id) && goals.some(accountTargetMetric))
      setExpanded((items) => (items.includes(id) ? items : [...items, id]));
  }
  async function submit() {
    setError("");
    if (!selected.length) return setError("请至少选择一位运营");
    if (!reason.trim()) return setError("请填写拆分原因");
    for (const id of selected) {
      for (const goal of goals) {
        if (accountTargetMetric(goal)) {
          const accounts = accountsFor(id);
          if (!accounts.length) return setError(`${id}：该运营暂无可匹配账号`);
          if (
            accounts.some(
              (account) =>
                accountTargets[accountTargetKey(id, goal.id, account.id)] === undefined ||
                accountTargets[accountTargetKey(id, goal.id, account.id)] === "",
            )
          )
            return setError(`请为${id}的每个账号填写${goal.metric}目标值，暂不承担的账号可填0`);
          if (!Number.isFinite(accountTargetSum(id, goal)) || accountTargetSum(id, goal) > 1e12)
            return setError(`${id}：账号目标合计须为有效的非负数`);
        } else {
          const value = Number(targets[`${id}:${goal.id}`]);
          if (
            targets[`${id}:${goal.id}`] === undefined ||
            targets[`${id}:${goal.id}`] === "" ||
            !Number.isFinite(value) ||
            value < 0 ||
            value > 1e12 ||
            (goal.kind === "count" && !Number.isInteger(value))
          )
            return setError("请为每位运营填写有效的全部指标目标值，人数、账号数须为整数");
        }
      }
    }
    if (goals.some((g) => g.target !== null && totalFor(g) > g.target + 1e-8))
      return setError("个人分配总额不能超过团队目标");
    setBusy(true);
    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "split-goals",
          goals: goals.map((g) => ({ id: g.id, version: g.version })),
          allocations: selected.map((id) => ({
            owner_id: id,
            targets: goals.map((g) => ({
              goal_id: g.id,
              target: accountTargetMetric(g)
                ? accountTargetSum(id, g)
                : Number(targets[`${id}:${g.id}`]),
              ...(accountTargetMetric(g) ? { account_targets: accountTargetMap(id, g) } : {}),
            })),
          })),
          reason,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "拆分失败");
      await onSaved(selected.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "拆分失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className={styles.splitDialog}>
        <header className={styles.splitHeader}>
          <div className={styles.splitEyebrow}>团队目标 / 个人分配</div>
          <DialogTitle className={styles.splitTitle}>拆分个人目标</DialogTitle>
          <DialogDescription className={styles.splitDescription}>
            {first.period.includes("Q")
              ? `${first.period.slice(0, 4)}年 · 第${first.period.slice(-1)}季度`
              : `${first.period.slice(0, 4)}年${Number(first.period.slice(5))}月`}
            <span>·</span>
            {first.project}
            <span>·</span>
            {departments.find((d) => d.id === first.dept_id)?.name ?? "跨部门"}
          </DialogDescription>
        </header>
        <div className={styles.splitBody}>
          <section className={styles.splitMetrics} aria-label="团队可分配额度">
            {goals.map((g) => {
              const over = g.target !== null && totalFor(g) > g.target + 1e-8;
              const percent = (value: number) =>
                g.target ? Math.max(0, Math.min(100, (value / g.target) * 100)) : 0;
              const used = percent(existingFor(g));
              return (
                <article
                  key={g.id}
                  className={`${styles.splitMetric} ${over ? styles.splitOver : ""}`}
                >
                  <div className={styles.splitMetricHeading}>
                    <h3>{g.metric}</h3>
                    <span>团队目标</span>
                  </div>
                  <strong className={styles.splitMetricValue}>{fmt(g.target, g.unit)}</strong>
                  <div className={styles.splitAllocationBar} aria-hidden="true">
                    <i style={{ width: `${used}%` }} />
                    <b style={{ width: `${Math.min(100 - used, percent(pendingFor(g)))}%` }} />
                  </div>
                  <dl className={styles.splitMetricNumbers}>
                    <div>
                      <dt>已分配</dt>
                      <dd>{fmt(existingFor(g), g.unit)}</dd>
                    </div>
                    <div>
                      <dt>本次分配</dt>
                      <dd>{fmt(pendingFor(g), g.unit)}</dd>
                    </div>
                    <div>
                      <dt>{over ? "超出额度" : "剩余额度"}</dt>
                      <dd>{fmt(Math.abs((g.target ?? 0) - totalFor(g)), g.unit)}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </section>
          <section className={styles.splitAllocation} aria-label="运营目标分配">
            <div className={styles.splitSectionHead}>
              <div>
                <h3>
                  <Users size={16} />
                  运营目标分配
                </h3>
                <p>
                  勾选运营后填写目标值，暂不承担的指标可填 0。可参考当前关联账号的
                  {first.period.includes("Q") ? "上季" : "上月"}完整周期数据。
                </p>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.button}
                  disabled={
                    previewLoading || options.status !== "ready" || !options.data?.users.length
                  }
                  onClick={() => void loadPrevious()}
                >
                  {previewLoading ? "正在读取…" : `预览${previousLabel}数据`}
                </button>
                <button
                  type="button"
                  className={styles.link}
                  disabled={busy || !availableUsers.length}
                  onClick={() => setSelected(allSelected ? [] : availableUsers.map((u) => u.id))}
                >
                  {allSelected ? "取消全选" : "选择全部待分配"}
                </button>
              </div>
            </div>
            <div className={styles.splitTableWrap}>
              <table className={styles.splitTable}>
                <thead>
                  <tr>
                    <th scope="col">
                      运营人员 <span>{options.data?.users.length ?? 0}</span>
                    </th>
                    <th scope="col">关联账号</th>
                    {goals.map((g) => (
                      <th scope="col" key={g.id}>
                        {g.metric}
                        <small>目标值 · {g.unit}</small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {options.data?.users.map((user) => {
                    const isAssigned = assigned.has(user.id);
                    const isSelected = selected.includes(user.id);
                    const isExpanded = expanded.includes(user.id);
                    return (
                      <Fragment key={user.id}>
                        <tr className={isSelected ? styles.splitSelectedRow : undefined}>
                          <th scope="row">
                            <label className={styles.splitPerson}>
                              <input
                                type="checkbox"
                                aria-label={`选择${user.name}`}
                                disabled={isAssigned || busy}
                                checked={isSelected}
                                onChange={() => togglePerson(user.id)}
                              />
                              <span className={styles.splitAvatar} aria-hidden="true">
                                {user.name.slice(0, 1)}
                              </span>
                              <span>
                                <strong>{user.name}</strong>
                                <small>
                                  {isAssigned ? (
                                    <>
                                      <Check size={11} /> 已分配
                                    </>
                                  ) : isSelected ? (
                                    "本次分配"
                                  ) : (
                                    "待分配"
                                  )}
                                </small>
                              </span>
                            </label>
                          </th>
                          <td>
                            <button
                              type="button"
                              className={styles.splitAccountsButton}
                              aria-expanded={isExpanded}
                              aria-label={`${user.name}的关联账号`}
                              onClick={() =>
                                setExpanded((items) =>
                                  isExpanded
                                    ? items.filter((id) => id !== user.id)
                                    : [...items, user.id],
                                )
                              }
                            >
                              {accountsFor(user.id).length} 个账号{" "}
                              {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            </button>
                          </td>
                          {goals.map((g) => (
                            <td key={g.id}>
                              <div className={styles.splitTargetCell}>
                                {isAssigned ? (
                                  <span className={styles.splitExistingValue}>
                                    {fmt(
                                      existing
                                        .filter(
                                          (item) =>
                                            item.owner_ids.includes(user.id) &&
                                            sameTeamMetric(item, g),
                                        )
                                        .reduce((sum, item) => sum + (item.target ?? 0), 0),
                                      g.unit,
                                    )}
                                  </span>
                                ) : accountTargetMetric(g) ? (
                                  <span className={styles.splitAccountTargetSummary}>
                                    按账号合计 {fmt(accountTargetSum(user.id, g), g.unit)}
                                  </span>
                                ) : (
                                  <input
                                    className={styles.splitTargetInput}
                                    type="number"
                                    min="0"
                                    max={1e12}
                                    step={g.kind === "count" ? "1" : "any"}
                                    aria-label={`${user.name}·${g.metric}目标值`}
                                    placeholder={isSelected ? "填写目标值" : "选中后填写"}
                                    disabled={!isSelected || busy}
                                    value={targets[`${user.id}:${g.id}`] ?? ""}
                                    onChange={(e) =>
                                      setTargets((current) => ({
                                        ...current,
                                        [`${user.id}:${g.id}`]: e.target.value,
                                      }))
                                    }
                                  />
                                )}
                                {previewKey === contextKey && (
                                  <div className={styles.splitHistory} role="status">
                                    <PreviousActual
                                      result={preview[`${user.id}:${g.id}`]}
                                      label={previousLabel}
                                    />
                                  </div>
                                )}
                              </div>
                            </td>
                          ))}
                        </tr>
                        {isExpanded && (
                          <tr className={styles.splitAccountRow}>
                            <td colSpan={goals.length + 2}>
                              <div className={styles.splitAccountList}>
                                <span>{goals.some(accountTargetMetric) ? "按账号分别填写消耗目标" : "自动匹配账号"}</span>
                                {accountsFor(user.id).map((a) => (
                                  <span key={a.id}>{a.name}</span>
                                ))}
                              </div>
                              {goals.filter(accountTargetMetric).map((g) => (
                                <div className={styles.splitAccountTargets} key={g.id}>
                                  <strong>{g.metric}（{g.unit}）</strong>
                                  {accountsFor(user.id).map((a) => {
                                    const key = accountTargetKey(user.id, g.id, a.id);
                                    return (
                                      <label key={a.id} className={styles.splitAccountTargetField}>
                                        <span>{a.name}</span>
                                        <input
                                          className={styles.splitTargetInput}
                                          type="number"
                                          min="0"
                                          max={1e12}
                                          step="any"
                                          aria-label={`${user.name}·${a.name}·${g.metric}目标值`}
                                          placeholder={isSelected ? "填写目标值" : "选中后填写"}
                                          disabled={!isSelected || busy}
                                          value={accountTargets[key] ?? ""}
                                          onChange={(e) =>
                                            setAccountTargets((current) => ({
                                              ...current,
                                              [key]: e.target.value,
                                            }))
                                          }
                                        />
                                      </label>
                                    );
                                  })}
                                </div>
                              ))}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {options.status === "loading" && (
                    <tr>
                      <td colSpan={goals.length + 2} className={styles.splitEmpty}>
                        正在读取运营人员与关联账号…
                      </td>
                    </tr>
                  )}
                  {options.status === "ready" && !options.data?.users.length && (
                    <tr>
                      <td colSpan={goals.length + 2} className={styles.splitEmpty}>
                        暂无可分配的运营，请先完善产品、部门和经纪人归属。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {!!options.data?.unassignedOperators && (
              <p className={styles.splitNotice}>
                {options.data.unassignedOperators} 个账号的运营归属待确认，暂不自动分配。
              </p>
            )}
          </section>
          <label className={styles.splitReason}>
            拆分说明
            <textarea
              rows={2}
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              placeholder="补充本次目标分配的依据"
            />
          </label>
          <p className={styles.splitHint}>
            指标、权重和统计口径继承团队设置，账号自动匹配。保存为个人草稿，核对后再发布。
          </p>
          {(error || options.error || overAllocated) && (
            <p role="alert" className={styles.error}>
              {error || options.error || "本次分配已超出团队剩余额度，请调整标红指标的目标值。"}
            </p>
          )}
        </div>
        <footer className={styles.splitFooter}>
          <p>
            已选择 <strong>{selected.length}</strong> 位运营<span>·</span>
            {goals.length} 项指标
          </p>
          <div className={styles.actions}>
            <button className={styles.button} disabled={busy} onClick={onClose}>
              取消
            </button>
            <button
              className={styles.primary}
              disabled={busy || options.status !== "ready" || !selected.length || overAllocated}
              onClick={() => void submit()}
            >
              {busy ? "正在保存…" : "保存个人草稿"}
            </button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function PreviousActual({
  result,
  label,
}: {
  result?: { goal?: Goal; error?: string };
  label: string;
}) {
  if (result?.goal) return <GoalPreviewValue goal={result.goal} label={label} compact />;
  return (
    <small className={result?.error ? styles.error : styles.muted}>
      {result?.error || "正在读取…"}
    </small>
  );
}
