"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BUYU_GOAL_GROUPS,
  BUYU_TOTAL_PRODUCT,
  DOUYIN_GOAL_GROUPS,
  SOURCE_PRODUCTS,
  goalMetrics,
  type GoalBinding,
  type GoalDefinition,
} from "@/modules/goals";
import type { GoalPreview } from "@/modules/goals/types";
import { GoalPreviewValue } from "./goal-preview-value";
import styles from "./goals.module.css";
import type { SourceOptionsState } from "./use-source-options";
import { newMetricDraft, mergeMetric, metricDefinitions, type MetricDraft } from "./metric-drafts";

export function bindingForProject(project: string): GoalBinding | null {
  const p = SOURCE_PRODUCTS.douyin.find((p) => p.name === project);
  if (p)
    return {
      source: "douyin",
      product: p.id,
      field: "",
      selection: "all",
      account_ids: [],
      direction: "gte",
      qualification: null,
    };
  if (project === "捕鱼")
    return {
      source: "buyu",
      product: BUYU_TOTAL_PRODUCT,
      field: "",
      selection: "all",
      account_ids: [],
      direction: "gte",
      qualification: null,
    };
  return null;
}
export function MetricPicker({
  value,
  onChange,
  sourceOptions,
  additionalMetrics,
  onAdditionalMetricsChange,
  lockedFields = [],
}: {
  lockedFields?: string[];
  value: GoalDefinition;
  onChange: (v: GoalDefinition) => void;
  sourceOptions: SourceOptionsState;
  additionalMetrics: MetricDraft[];
  onAdditionalMetricsChange: (metrics: MetricDraft[]) => void;
}) {
  const b = value.binding;
  const [group, setGroup] = useState("");
  const [search, setSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const options = sourceOptions.data;
  const operatorAccounts =
    options?.accounts.filter(
      (a) =>
        a.operator_ids?.length === 1 && a.operator_ids.some((id) => value.owner_ids.includes(id)),
    ) ?? [];
  const [error, setError] = useState("");
  const [previews, setPreviews] = useState<
    { metric: string; goal?: GoalPreview; error?: string }[]
  >([]);
  const [previewKey, setPreviewKey] = useState("");
  const previewSequence = useRef(0);
  const definitions = metricDefinitions(value, additionalMetrics);
  const signature = JSON.stringify(
    definitions.map((definition) => ({
      period: definition.period,
      project: definition.project,
      dept_id: definition.dept_id,
      owner_ids: definition.owner_ids,
      binding: definition.binding,
    })),
  );
  const previewController = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      previewSequence.current++;
      previewController.current?.abort();
      setLoading(false);
    },
    [signature],
  );
  const selectedFields = new Set([b?.field, ...additionalMetrics.map((m) => m.binding.field)]);
  const [loading, setLoading] = useState(false);
  const source = b?.source;
  const all = useMemo(() => (source ? goalMetrics(source) : []), [source]);
  const groups = source === "buyu" ? BUYU_GOAL_GROUPS : DOUYIN_GOAL_GROUPS;
  const activeGroup = groups.includes(group) ? group : groups[0];
  const visible = all.filter((m) =>
    search
      ? `${m.label}${m.group}${m.subGroup ?? ""}`.toLowerCase().includes(search.toLowerCase())
      : m.group === activeGroup,
  );
  function change(binding: GoalBinding | null) {
    setPreviews([]);
    onChange({ ...value, binding, parent_id: null, confirmed: false });
  }
  function pick(key: string) {
    if (!b || lockedFields.includes(key)) return;
    const draft = newMetricDraft(b, key);
    if (!draft) return;
    if (key === b.field) {
      const [next, ...rest] = additionalMetrics;
      if (next) {
        onChange(mergeMetric(value, next));
        onAdditionalMetricsChange(rest);
      } else
        onChange({
          ...value,
          metric: "",
          target: null,
          parent_id: null,
          confirmed: false,
          binding: { ...b, field: "", qualification: null, qualification_by_product: undefined },
        });
    } else if (selectedFields.has(key)) {
      onAdditionalMetricsChange(additionalMetrics.filter((m) => m.binding.field !== key));
    } else if (!b.field) {
      onChange({ ...mergeMetric(value, draft), confirmed: false });
    } else if (definitions.length < 20) {
      onAdditionalMetricsChange([...additionalMetrics, draft]);
      onChange({ ...value, confirmed: false });
    }
    setPreviews([]);
  }
  async function loadPreview() {
    setError("");
    setLoading(true);
    setPreviews([]);
    const sequence = ++previewSequence.current;
    previewController.current?.abort();
    const controller = new AbortController();
    previewController.current = controller;
    const results: { metric: string; goal?: GoalPreview; error?: string }[] = [];
    for (let i = 0; i < definitions.length; i += 4) {
      if (controller.signal.aborted) break;
      results.push(
        ...(await Promise.all(
          definitions.slice(i, i + 4).map(async (definition) => {
            try {
              const r = await fetch("/api/goals", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "preview", mode: "comparison", definition }),
                signal: controller.signal,
              });
              const json = await r.json();
              if (!r.ok) throw new Error(json.error);
              return { metric: definition.metric, goal: json.item as GoalPreview };
            } catch (e) {
              return {
                metric: definition.metric,
                error: e instanceof Error ? e.message : "预览失败",
              };
            }
          }),
        )),
      );
    }
    if (!controller.signal.aborted && sequence === previewSequence.current) {
      setPreviews(results);
      setPreviewKey(signature);
      setLoading(false);
    }
  }
  return (
    <div className={styles.full}>
      <label>
        指标来源
        <select
          disabled={lockedFields.length > 0 || !!value.team_parent_id}
          aria-label="指标来源"
          value={b ? `${b.source}:${b.product}` : "manual"}
          onChange={(e) => {
            const [s, p = ""] = e.target.value.split(":");
            setGroup("");
            setSearch("");
            setError("");
            if (s === "manual") {
              setPreviews([]);
              onChange({
                ...value,
                binding: null,
                owner_ids: [],
                owner_labels: [],
                parent_id: null,
                confirmed: false,
              });
              return;
            }
            const source = s as "douyin" | "buyu";
            const item = SOURCE_PRODUCTS[source].find((x) => x.id === p);
            const binding: GoalBinding = {
              source,
              product: p,
              field: "",
              selection: "all",
              account_ids: [],
              direction: "gte",
              qualification: null,
            };
            setPreviews([]);
            onChange({
              ...value,
              project: source === "buyu" ? "捕鱼" : (item?.name ?? value.project),
              binding,
              owner_ids: [],
              owner_labels: [],
              metric: "",
              confirmed: false,
              parent_id: null,
            });
          }}
        >
          <option value="manual">人工指标（招聘等 / 保留原目标）</option>
          {(["douyin", "buyu"] as const).map((s) => (
            <optgroup key={s} label={s === "douyin" ? "抖音 · 主播明细" : "捕鱼 · 投流日志"}>
              {SOURCE_PRODUCTS[s].map((p) => (
                <option key={p.id} value={`${s}:${p.id}`}>
                  {s === "buyu" ? "捕鱼 / " : ""}
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {b && (
        <>
          {b.source === "buyu" && b.product === BUYU_TOTAL_PRODUCT && (
            <div className={styles.metricNote}>
              <strong>捕鱼总盘 · 3D / UE4 / URP</strong>
              <p className={styles.muted}>
                按账号已有产品归属读取投流日志，消耗合并累计；达标账号按各产品条件独立判断、去重汇总。拆到运营后自动匹配名下账号。
              </p>
            </div>
          )}
          <div className={styles.metricHeader}>
            <strong>选择标准指标</strong>
            <input
              aria-label="搜索指标"
              placeholder="搜索指标名称"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className={styles.metricPicker}>
            <nav aria-label="指标类别">
              {groups.map((g) => (
                <button
                  type="button"
                  key={g}
                  aria-pressed={!search && g === activeGroup}
                  className={g === activeGroup && !search ? styles.selected : ""}
                  onClick={() => {
                    setGroup(g);
                    setSearch("");
                  }}
                >
                  {g}
                </button>
              ))}
            </nav>
            <div className={styles.metricOptions} role="group" aria-label="指标选项">
              {visible.map((m, i) => (
                <div key={m.key}>
                  {(i === 0 ||
                    visible[i - 1]?.subGroup !== m.subGroup ||
                    visible[i - 1]?.group !== m.group) && <h4>{m.subGroup || m.group}</h4>}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={selectedFields.has(m.key)}
                    disabled={
                      lockedFields.includes(m.key) ||
                      !!value.team_parent_id ||
                      !m.selectable ||
                      (!selectedFields.has(m.key) && !!b.field && definitions.length >= 20)
                    }
                    title={m.note}
                    onClick={() => pick(m.key)}
                    className={`${styles.metricOption} ${selectedFields.has(m.key) ? styles.selected : ""}`}
                  >
                    <span>
                      {selectedFields.has(m.key) ? "☑" : "☐"} {m.label}
                    </span>
                    <small>{m.selectable ? m.unit : "信息字段 / 待接入"}</small>
                  </button>
                </div>
              ))}
              {!visible.length && <p className={styles.muted}>未找到匹配指标</p>}
            </div>
          </div>
          {b.field && (
            <div className={styles.metricBatchList} aria-label="已选指标目标值">
              <p className={styles.muted}>
                已选 {definitions.length}{" "}
                项指标（最多20项），分别填写目标值；下方逐项设置条件与口径，统计账号共用。
              </p>
              {definitions.map((item, index) => (
                <div className={styles.metricBatchRow} key={item.binding?.field}>
                  <strong>{item.metric}</strong>
                  <label>
                    目标值（{item.unit}）
                    <input
                      aria-label={`目标值·${item.metric}`}
                      type="number"
                      min="0"
                      step={item.kind === "count" ? "1" : "any"}
                      value={item.target ?? ""}
                      onChange={(e) => {
                        const target = e.target.value === "" ? null : Number(e.target.value);
                        if (!index) onChange({ ...value, target });
                        else
                          onAdditionalMetricsChange(
                            additionalMetrics.map((m, i) =>
                              i === index - 1 ? { ...m, target } : m,
                            ),
                          );
                      }}
                    />
                  </label>
                </div>
              ))}
            </div>
          )}
          <div className={styles.bindingGrid}>
            <label>
              统计范围
              <select
                aria-label="统计范围"
                disabled={!!value.team_parent_id}
                value={b.selection}
                onChange={(e) =>
                  change({
                    ...b,
                    selection: e.target.value as GoalBinding["selection"],
                    account_ids: [],
                    account_snapshot_at: null,
                  })
                }
              >
                {b.selection === "operators" && (
                  <option value="operators">个人目标 · 按运营归属自动匹配</option>
                )}
                <option value="accounts">自定义 · 指定账号</option>
                {(options?.allowAll || b.selection === "all") && (
                  <option disabled={!options?.allowAll} value="all">
                    {value.dept_id ? "团队目标 · 所选部门全部归属账号" : "团队目标 · 整个产品"}
                  </option>
                )}
              </select>
            </label>
          </div>
          {b.selection === "operators" && (
            <div className={styles.metricNote}>
              <strong>账号范围：按运营归属自动匹配</strong>
              <p>
                {value.owner_ids.length === 1
                  ? `当前匹配 ${operatorAccounts.length} 个账号`
                  : "请选择一位运营负责人"}{" "}
                · 同时按产品、部门筛选
              </p>
              <details>
                <summary>查看账号名单</summary>
                <ul className={styles.missingAccounts}>
                  {operatorAccounts.map((a) => (
                    <li key={a.id}>{a.name}</li>
                  ))}
                </ul>
              </details>
              <p className={styles.muted}>
                {b.account_snapshot_at
                  ? `已发布范围固定为${b.account_ids.length}个账号。上方为当前归属名单；更新固定范围请在详情中操作。`
                  : "草稿随运营归属自动匹配，发布时固定账号范围，后续可在详情中确认更新。"}
              </p>
              {sourceOptions.status === "ready" &&
                value.owner_ids.length === 1 &&
                !operatorAccounts.length && (
                  <p className={styles.warning}>
                    该运营暂无已确认归属账号，请先完善运营经纪人记录。
                  </p>
                )}
            </div>
          )}
          {b.selection === "accounts" && (
            <div style={{ marginTop: 12 }}>
              <label>
                统计账号 · 可选 {options?.accounts.length ?? 0} 个 · 已选 {b.account_ids.length} 个
                <input
                  aria-label="搜索统计账号"
                  value={accountSearch}
                  placeholder="搜索账号，勾选本业务线的主播或投流账号"
                  onChange={(e) => setAccountSearch(e.target.value)}
                />
              </label>
              <div className={styles.owners} style={{ marginTop: 6 }}>
                {options?.accounts
                  .filter((a) => a.name.includes(accountSearch) || b.account_ids.includes(a.id))
                  .map((a) => (
                    <button
                      type="button"
                      aria-pressed={b.account_ids.includes(a.id)}
                      key={a.id}
                      className={`${styles.owner} ${b.account_ids.includes(a.id) ? styles.selected : ""}`}
                      onClick={() =>
                        change({
                          ...b,
                          account_ids: (b.account_ids.includes(a.id)
                            ? b.account_ids.filter((id) => id !== a.id)
                            : [...b.account_ids, a.id]
                          ).sort(),
                        })
                      }
                    >
                      {b.account_ids.includes(a.id) ? "✓ " : ""}
                      {a.name}
                    </button>
                  ))}
                {sourceOptions.status === "loading" && (
                  <p className={styles.muted}>正在读取归属账号…</p>
                )}
                {options && !options.accounts.length && (
                  <p className={styles.muted}>暂无可选账号</p>
                )}
              </div>
              <p className={styles.muted}>
                按所选产品、部门的业务归因筛选账号，再从中选择统计范围；负责人用于分配责任。
              </p>
            </div>
          )}
          {!!options?.unassignedAccounts && (
            <p className={styles.muted}>
              {value.dept_id ? "所选部门" : "当前可访问范围"}另有 {options.unassignedAccounts}{" "}
              个账号的产品归属待确认，暂不纳入统计范围。
            </p>
          )}
          {b.selection === "operators" && !!options?.unassignedOperators && (
            <p className={styles.muted}>
              另有 {options.unassignedOperators} 个账号尚未确认唯一运营归属，暂不自动分配。
            </p>
          )}
          <div className={styles.metricHeader}>
            <span className={styles.muted}>数据随业务同步更新，实际值自动读取。</span>
            <button
              type="button"
              className={styles.button}
              disabled={loading || !b.field || sourceOptions.status !== "ready"}
              onClick={() => void loadPreview()}
            >
              {loading ? "正在读取…" : "预览本期 / 上期完成数"}
            </button>
          </div>
          {previewKey === signature &&
            previews.map((result) => (
              <div key={result.metric} className={styles.metricNote} role="status">
                <strong>{result.metric}</strong>
                {result.error ? (
                  <p className={styles.error}>{result.error}</p>
                ) : (
                  result.goal && (
                    <>
                      <div className={styles.previewComparison}>
                        <GoalPreviewValue goal={result.goal} label="本期完成" />
                        {result.goal.previous && (
                          <GoalPreviewValue
                            goal={result.goal.previous}
                            label={value.period.includes("Q") ? "上季完成" : "上月完成"}
                          />
                        )}
                      </div>
                      <p className={styles.muted}>按当前所选项目、指标及关联账号范围对比。</p>
                    </>
                  )
                )}
              </div>
            ))}
        </>
      )}
      {sourceOptions.error && (
        <p role="alert" className={styles.error}>
          {sourceOptions.error}
        </p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
