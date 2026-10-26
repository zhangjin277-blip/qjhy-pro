"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  formatGoalValue as fmt,
  SOURCE_PRODUCTS,
  BUYU_TOTAL_PRODUCT,
  BUYU_SOURCE_PRODUCTS,
  type Goal,
  type GoalList,
} from "@/modules/goals";
import type { PersonalTeamOption } from "@/modules/goals/types";
import { GoalPeriodPicker } from "./goal-period-picker";
import { bindingForProject } from "./metric-picker";
import { useSourceOptions } from "./use-source-options";
import styles from "./goals.module.css";

export function GoalTypeSwitch({
  personal,
  onTeam,
  onPersonal,
}: {
  personal: boolean;
  onTeam?: () => void;
  onPersonal?: () => void;
}) {
  return (
    <div className={styles.periodSwitch} role="group" aria-label="目标类型">
      <button type="button" aria-pressed={!personal} onClick={onTeam}>
        团队目标
      </button>
      <button type="button" aria-pressed={personal} onClick={onPersonal}>
        个人目标
      </button>
    </div>
  );
}

export function PersonalGoalDialog({
  data,
  departments,
  initialPeriod,
  existing = [],
  onClose,
  onTeam,
  onSaved,
}: {
  data: GoalList;
  departments: GoalList["departments"];
  initialPeriod: string;
  existing?: Goal[];
  onClose: () => void;
  onTeam: () => void;
  onSaved: () => Promise<void>;
}) {
  const first = existing[0];
  const editing = !!first;
  const canAssignOthers = !!data.access.canManageTeam;
  const ownDepartmentIds = data.users.find((u) => u.id === data.access.userId)?.deptIds ?? [];
  const departmentOptions = canAssignOthers
    ? departments
    : departments.filter((d) => ownDepartmentIds.includes(d.id));
  const [period, setPeriod] = useState(first?.period ?? initialPeriod);
  const [project, setProject] = useState(first?.project ?? "");
  const [buyuProduct, setBuyuProduct] = useState(
    first?.binding?.source === "buyu"
      ? first.binding.product
      : (SOURCE_PRODUCTS.buyu[0]?.id ?? BUYU_TOTAL_PRODUCT),
  );
  const [departmentId, setDepartmentId] = useState(
    first?.dept_id ?? (!canAssignOthers ? departmentOptions[0]?.id : "") ?? "",
  );
  const [ownerId, setOwnerId] = useState(first?.owner_ids[0] ?? data.access.userId ?? "");
  const [teamId, setTeamId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    items: PersonalTeamOption[];
    error: string;
  } | null>(null);
  const projectBinding = bindingForProject(project);
  const binding =
    projectBinding && project === "捕鱼"
      ? { ...projectBinding, product: buyuProduct }
      : projectBinding;
  const source = useSourceOptions(editing ? null : binding, departmentId || null);
  const ownerOptions = (source.data?.users ?? []).filter(
    (u) => canAssignOthers || u.id === data.access.userId,
  );
  const ownerValid = editing || ownerOptions.some((u) => u.id === ownerId);
  const key =
    project && ownerId && ownerValid
      ? JSON.stringify([
          period,
          project,
          departmentId,
          ownerId,
          first?.team_parent_id ?? null,
          binding?.product ?? null,
          retry,
        ])
      : "";
  useEffect(() => {
    if (!key) return;
    const [period, project, dept, owner, team, dataset] = JSON.parse(key) as [
      string,
      string,
      string,
      string,
      string | null,
      string | null,
    ];
    const query = new URLSearchParams({ "personal-teams": "1", period, project, owner });
    if (dept) query.set("dept", dept);
    if (team) query.set("team", team);
    if (dataset) query.set("dataset", dataset);
    const controller = new AbortController();
    fetch(`/api/goals?${query}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "团队目标读取失败");
        if (!controller.signal.aborted) setResult({ key, items: json.items, error: "" });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setResult({
            key,
            items: [],
            error: error instanceof Error ? error.message : "团队目标读取失败",
          });
      });
    return () => controller.abort();
  }, [key]);
  const options = result?.key === key ? result.items : [];
  const loading = !!key && result?.key !== key;
  const team =
    options.find((item) => item.id === teamId) ?? (options.length === 1 ? options[0] : undefined);
  const existingFor = (metric: PersonalTeamOption["metrics"][number]) =>
    metric.existing ??
    existing.find(
      (g) =>
        !g.team_parent_id &&
        g.metric === metric.metric &&
        g.unit === metric.unit &&
        g.kind === metric.kind,
    );
  const linkingLegacy = editing && !first.team_parent_id;
  const legacyConflict = linkingLegacy && team?.metrics.some((g) => g.existing);
  const legacyUnmatched =
    linkingLegacy &&
    team &&
    existing.some(
      (g) =>
        !team.metrics.some((m) => m.metric === g.metric && m.unit === g.unit && m.kind === g.kind),
    );
  const valueOf = (metric: PersonalTeamOption["metrics"][number]) =>
    values[`${key}:${team?.id}:${metric.id}`] ??
    (existingFor(metric)?.target == null ? "" : String(existingFor(metric)?.target));
  const accountMetric = (metric: PersonalTeamOption["metrics"][number]) =>
    team?.source === "buyu" && metric.metric === "消耗" && metric.kind === "sum";
  const accountValueOf = (
    metric: PersonalTeamOption["metrics"][number],
    accountId: string,
  ) => {
    const fieldKey = `${key}:${team?.id}:${metric.id}:${accountId}`;
    const current = values[fieldKey];
    if (current !== undefined) return current;
    const item = existingFor(metric);
    let inherited: number | undefined;
    if (item && "account_targets" in item) inherited = item.account_targets?.[accountId];
    else if (item && "binding" in item) inherited = item.binding?.account_targets?.[accountId];
    return inherited === undefined ? "" : String(inherited);
  };
  const accountSum = (metric: PersonalTeamOption["metrics"][number]) =>
    team?.accounts.reduce((sum, account) => sum + (Number(accountValueOf(metric, account.id)) || 0), 0) ?? 0;
  const locked = team?.metrics.some(
    (g) =>
      existingFor(g) &&
      (existingFor(g)?.status === "draft" ? !data.access.fill : !data.access.publish),
  );
  async function submit() {
    setError("");
    if (!team) return setError("请选择要关联的团队目标");
    if (legacyConflict || legacyUnmatched) return setError("请核对原个人目标与团队指标的关联");
    if (locked) return setError("已发布的个人目标需要负责人或具有发布权限的管理人员调整");
    for (const metric of team.metrics) {
      if (accountMetric(metric)) {
        const accountTargets = Object.fromEntries(
          team.accounts.map((account) => [account.id, Number(accountValueOf(metric, account.id))]),
        );
        if (
          team.accounts.some(
            (account) => {
              const target = accountTargets[account.id];
              return (
                accountValueOf(metric, account.id).trim() === "" ||
                !Number.isFinite(target) ||
                (target ?? -1) < 0
              );
            },
          )
        )
          return setError(`请为${metric.metric}的每个关联账号填写目标值，暂不承担可填0`);
        if (accountSum(metric) > metric.available + 1e-8)
          return setError(`${metric.metric}：个人分配总额不能超过团队目标`);
        continue;
      }
      const value = valueOf(metric);
      if (
        !value.trim() ||
        !Number.isFinite(Number(value)) ||
        Number(value) < 0 ||
        (metric.kind === "count" && !Number.isInteger(Number(value)))
      )
        return setError(`请填写${metric.metric}的有效目标值，暂不承担可填0`);
      if (Number(value) > metric.available + 1e-8)
        return setError(`${metric.metric}：个人分配总额不能超过团队目标`);
    }
    setBusy(true);
    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-personal-goals",
          team_id: team.id,
          owner_id: ownerId,
          targets: team.metrics.map((g) => {
            const existing = existingFor(g);
            const accountTargets = accountMetric(g)
              ? Object.fromEntries(
                  team.accounts.map((account) => [
                    account.id,
                    Number(accountValueOf(g, account.id)),
                  ]),
                )
              : undefined;
            return {
              goal: { id: g.id, version: g.version },
              target: accountMetric(g) ? accountSum(g) : Number(valueOf(g)),
              edit: existing ? { id: existing.id, version: existing.version } : null,
              ...(accountTargets ? { account_targets: accountTargets } : {}),
            };
          }),
          reason: editing
            ? "调整个人目标值，沿用团队指标与权重"
            : "提交个人目标，沿用团队指标与权重",
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "个人目标提交失败");
      await onSaved();
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "个人目标提交失败");
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
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[820px]">
        <DialogTitle>
          {editing ? "调整个人目标" : canAssignOthers ? "新建目标" : "新建个人目标"}
        </DialogTitle>
        <DialogDescription>
          关联团队后继承全部指标、权重和统计口径，只需填写自己的目标值。提交后由负责人核对、调整并发布。
        </DialogDescription>
        {!editing && canAssignOthers && <GoalTypeSwitch personal onTeam={onTeam} />}
        <div className={styles.form}>
          <GoalPeriodPicker value={period} disabled={editing || busy} onChange={setPeriod} />
          <label>
            项目
            <select
              value={project}
              disabled={editing || busy}
              onChange={(e) => {
                setProject(e.target.value);
                setTeamId("");
              }}
            >
              <option value="">请选择项目</option>
              {[
                ...new Set([
                  ...SOURCE_PRODUCTS.douyin.map((p) => p.name),
                  "捕鱼",
                  ...(first ? [first.project] : []),
                ]),
              ].map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          {project === "捕鱼" && (
            <label className={styles.full}>
              来源产品
              <select
                value={buyuProduct}
                disabled={editing || busy}
                onChange={(e) => {
                  setBuyuProduct(e.target.value);
                  setTeamId("");
                }}
              >
                {SOURCE_PRODUCTS.buyu.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className={styles.full}>
            归属部门
            <select
              value={departmentId}
              disabled={editing || busy}
              onChange={(e) => {
                setDepartmentId(e.target.value);
                setTeamId("");
              }}
            >
              <option value="">未指定 / 跨部门</option>
              {departmentOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.full}>
            负责人（运营）
            <select
              value={ownerId}
              disabled={!canAssignOthers || editing || busy || source.status === "loading"}
              onChange={(e) => {
                setOwnerId(e.target.value);
                setTeamId("");
              }}
            >
              <option value="">请选择运营</option>
              {ownerId && !ownerOptions.some((u) => u.id === ownerId) && (
                <option value={ownerId}>
                  {data.users.find((u) => u.id === ownerId)?.name ?? "已绑定运营"}
                </option>
              )}
              {ownerOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <span className={styles.muted}>
              {source.status === "loading"
                ? "正在读取归属人员…"
                : canAssignOthers
                  ? "按产品、部门和管理权限筛选；个人目标选择一位运营。"
                  : "负责人固定为本人；如需为其他运营制定目标，请由部门负责人操作。"}
            </span>
          </label>
          <label className={styles.full}>
            关联团队目标
            <select
              disabled={busy || !!first?.team_parent_id || loading || !options.length}
              value={team?.id ?? ""}
              onChange={(e) => setTeamId(e.target.value)}
            >
              <option value="">{loading ? "正在读取团队目标…" : "请选择团队目标"}</option>
              {options.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.project}
                  {item.source === "buyu"
                    ? ` / ${SOURCE_PRODUCTS.buyu.find((p) => p.id === item.product)?.name ?? item.product}`
                    : ""}{" "}
                  · {item.department} · {item.owners.join("、")} · {item.metrics.length}项指标
                </option>
              ))}
            </select>
          </label>
          {!loading &&
            !team &&
            source.status !== "loading" &&
            !source.error &&
            !(result?.key === key && result.error) && (
              <p className={`${styles.full} ${styles.muted}`}>
                {project && ownerValid && ownerId
                  ? "暂无可关联的团队目标。请负责人先发布同周期、项目和部门的团队累计指标，并确认该运营账号属于团队统计范围。"
                  : "先选择周期、项目、部门和运营，再选择对应的团队目标。"}
              </p>
            )}
          {team && (
            <>
              <div className={`${styles.metricNote} ${styles.full}`}>
                <strong>
                  指标来源：{team.source === "douyin" ? "抖音主播明细" : "捕鱼投流日志"} ·
                  按运营归属自动匹配
                </strong>
                <details>
                  <summary>当前匹配 {team.accounts.length} 个账号 · 查看名单</summary>
                  <ul className={styles.missingAccounts}>
                    {team.accounts.map((a) => (
                      <li key={a.id}>
                        {a.name}
                        {a.products?.length ? (
                          <span className={styles.muted}>
                            {" "}
                            ·{" "}
                            {a.products
                              .map(
                                (id) => BUYU_SOURCE_PRODUCTS.find((p) => p.id === id)?.name ?? id,
                              )
                              .join(" / ")}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </details>
                <p className={styles.muted}>
                  草稿随运营归属更新，发布时固定账号范围。已发布目标调整金额会保留原固定范围。
                </p>
              </div>
              {team.metrics.map((metric) => (
                <div key={metric.id} className={styles.form}>
                  {accountMetric(metric) ? (
                    <div className={`${styles.metricNote} ${styles.full}`}>
                      <strong>{metric.metric} · 按账号分别填写目标（{metric.unit}）</strong>
                      <span className={styles.muted}>
                        当前合计 {fmt(accountSum(metric), metric.unit)} · 扣除其他运营后可分配 {fmt(metric.available, metric.unit)}
                      </span>
                      <div className={styles.form}>
                        {team.accounts.map((account) => (
                          <label key={account.id}>
                            {account.name}
                            <input
                              type="number"
                              min="0"
                              max={metric.available}
                              step="any"
                              disabled={busy || !!locked}
                              value={accountValueOf(metric, account.id)}
                              onChange={(e) =>
                                setValues((current) => ({
                                  ...current,
                                  [`${key}:${team.id}:${metric.id}:${account.id}`]: e.target.value,
                                }))
                              }
                            />
                          </label>
                        ))}
                      </div>
                      <span className={styles.muted}>
                        团队目标 {fmt(metric.target, metric.unit)} · 继承权重 {Number(metric.weight.toFixed(2))}%
                      </span>
                    </div>
                  ) : (
                    <label>
                      {metric.metric} · 个人目标（{metric.unit}）
                      <input
                        type="number"
                        min="0"
                        max={metric.available}
                        step={metric.kind === "count" ? "1" : "any"}
                        disabled={busy || !!locked}
                        value={valueOf(metric)}
                        onChange={(e) =>
                          setValues((current) => ({
                            ...current,
                            [`${key}:${team.id}:${metric.id}`]: e.target.value,
                          }))
                        }
                      />
                      <span className={styles.muted}>
                        团队目标 {fmt(metric.target, metric.unit)} · 继承权重 {Number(metric.weight.toFixed(2))}%<br />
                        扣除其他运营后可分配 {fmt(metric.available, metric.unit)}
                      </span>
                    </label>
                  )}
                  <details className={styles.muted}>
                    <summary>查看团队统计口径</summary>
                    {metric.definition}
                  </details>
                </div>
              ))}
              <p className={`${styles.full} ${styles.muted}`}>
                无需单独配置指标、权重、季度关联或统计口径；季度拆分由团队维护。暂不承担的指标可填0。
              </p>
            </>
          )}
        </div>
        {source.error && (
          <p role="alert" className={styles.error}>
            {source.error}
          </p>
        )}
        {result?.key === key && result.error && (
          <p role="alert" className={styles.error}>
            {result.error}
            <button className={styles.link} onClick={() => setRetry((v) => v + 1)}>
              重试
            </button>
          </p>
        )}
        {locked && (
          <p className={styles.warning}>已有指标已发布，请由负责人或具有发布权限的管理人员调整。</p>
        )}
        {legacyConflict && (
          <p className={styles.warning}>
            该团队已有该运营的个人目标，请直接调整对应目标，避免重复关联。
          </p>
        )}
        {legacyUnmatched && (
          <p className={styles.warning}>
            原个人目标中有指标不属于所选团队，请选择包含原有全部指标的团队。
          </p>
        )}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button className={styles.button} disabled={busy} onClick={onClose}>
            取消
          </button>
          <button
            className={styles.primary}
            disabled={busy || !team || !!locked || loading || !!legacyConflict || !!legacyUnmatched}
            onClick={() => void submit()}
          >
            {busy ? "正在保存…" : editing ? "保存调整" : "提交个人目标"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
