"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowDown, ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import { businessDate } from "@/lib/business-date";
import type { ProjectKey } from "@/modules/dashboard";
import {
  RANKING_LABELS,
  RANKING_METRICS,
  WorkbenchRankingFilters,
  type RankingMetric,
  type WorkbenchRankingData,
} from "@/modules/dashboard";
import base from "./workbench.module.css";
import styles from "./workbench-ranking.module.css";

const products: { key: ProjectKey; label: string }[] = [
  { key: "ddz", label: "斗地主" },
  { key: "three", label: "三冰" },
  { key: "zhaohua", label: "造化" },
];
function shift(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
function presetDates(preset: string) {
  const today = businessDate();
  const yesterday = shift(today, -1);
  if (preset === "week") return { from: shift(yesterday, -6), to: yesterday };
  if (preset === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
  return { from: yesterday, to: yesterday };
}
function metricValue(value: number, metric: RankingMetric) {
  if (metric === "duration")
    return `${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} h`;
  return `${metric === "flow" ? "¥ " : ""}${value.toLocaleString("zh-CN", {
    maximumFractionDigits: metric === "flow" ? 2 : 0,
  })}`;
}
function Portrait({ avatar, name }: { avatar: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={styles.portrait}>
      {avatar && !failed ? (
        <Image
          src={avatar}
          alt=""
          width={40}
          height={40}
          unoptimized
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{name.slice(0, 1)}</span>
      )}
    </div>
  );
}

export function WorkbenchRanking({ refreshKey }: { refreshKey: number }) {
  const [project, setProject] = useState<ProjectKey>("ddz");
  const [metric, setMetric] = useState<RankingMetric>("flow");
  const [preset, setPreset] = useState("yesterday");
  const [dates, setDates] = useState(() => presetDates("yesterday"));
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(15);
  const [retry, setRetry] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<{
    key: string;
    data: WorkbenchRankingData | null;
    error: string | null;
  } | null>(null);
  const filters = WorkbenchRankingFilters.safeParse({
    project,
    metric,
    date_from: dates.from,
    date_to: dates.to,
  });
  const query = new URLSearchParams({
    project,
    metric,
    date_from: dates.from,
    date_to: dates.to,
  }).toString();
  const key = `${query}:${refreshKey}:${retry}`;
  const valid = filters.success;
  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/workbench/live-ranking?${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "排行榜加载失败");
        if (!controller.signal.aborted) setResult({ key, data: body, error: null });
      } catch (error) {
        if (!controller.signal.aborted)
          setResult({
            key,
            data: null,
            error: error instanceof Error ? error.message : "加载失败",
          });
      }
    }
    void load();
    return () => controller.abort();
  }, [key, query, valid]);
  useEffect(() => {
    if (!strip.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        const width = entry.contentRect.width;
        setPageSize(width >= 720 ? 15 : Math.max(2, Math.min(14, Math.floor(width / 60))));
      }
    });
    observer.observe(strip.current);
    return () => observer.disconnect();
  }, []);
  const current = valid && result?.key === key ? result : null;
  const data = current?.data;
  const error = !filters.success ? filters.error.issues[0]?.message : current?.error;
  const loading = valid && !current;
  const pageCount = Math.max(1, Math.ceil((data?.rows.length ?? 0) / pageSize));
  const visiblePage = Math.min(page, pageCount - 1);
  const start = visiblePage * pageSize;
  const rows = data?.rows.slice(start, start + pageSize) ?? [];

  return (
    <section className={`${base.panel} ${styles.panel}`} aria-label="直播排行榜">
      <header className={`${base.panelHeader} ${styles.header}`}>
        <h2>
          <Trophy />
          直播排行榜
          <span className={base.caption}>抖音生态主播</span>
        </h2>
        <div className={styles.dateControls}>
          <select
            aria-label="排行榜统计周期"
            value={preset}
            onChange={(event) => {
              const next = event.target.value;
              setPreset(next);
              if (next !== "custom") setDates(presetDates(next));
              setPage(0);
            }}
          >
            <option value="yesterday">昨日</option>
            <option value="week">近7天</option>
            <option value="month">本月</option>
            <option value="custom">自定义</option>
          </select>
          {preset === "custom" ? (
            <div className={styles.dateInputs}>
              <input
                type="date"
                aria-label="排行榜开始日期"
                value={dates.from}
                onChange={(event) => {
                  setDates({ ...dates, from: event.target.value });
                  setPage(0);
                }}
              />
              <span>至</span>
              <input
                type="date"
                aria-label="排行榜结束日期"
                value={dates.to}
                onChange={(event) => {
                  setDates({ ...dates, to: event.target.value });
                  setPage(0);
                }}
              />
            </div>
          ) : (
            <span>{dates.from === dates.to ? dates.to : `${dates.from} 至 ${dates.to}`}</span>
          )}
        </div>
      </header>
      <div className={styles.products} role="group" aria-label="排行榜产品">
        {products.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={project === item.key}
            onClick={() => {
              setProject(item.key);
              setPage(0);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className={styles.toolbar}>
        <div className={styles.metrics} role="group" aria-label="排行榜指标">
          {RANKING_METRICS.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={metric === item}
              onClick={() => {
                setMetric(item);
                setPage(0);
              }}
            >
              {RANKING_LABELS[item]}
              {metric === item && <ArrowDown size={12} />}
            </button>
          ))}
        </div>
        <nav className={styles.pagination} aria-label="排行榜翻页">
          <button
            type="button"
            aria-label="排行榜上一页"
            disabled={visiblePage === 0 || loading}
            onClick={() => setPage(visiblePage - 1)}
          >
            <ChevronLeft size={17} />
          </button>
          <span>
            {visiblePage + 1} / {pageCount}
          </span>
          <button
            type="button"
            aria-label="排行榜下一页"
            disabled={visiblePage >= pageCount - 1 || loading}
            onClick={() => setPage(visiblePage + 1)}
          >
            <ChevronRight size={17} />
          </button>
        </nav>
      </div>
      <div ref={strip} className={styles.body} aria-busy={loading}>
        {error ? (
          <div className={styles.empty} role="alert">
            <p>{error}</p>
            {valid && (
              <button type="button" onClick={() => setRetry((n) => n + 1)}>
                重新加载
              </button>
            )}
          </div>
        ) : loading ? (
          <div className={styles.empty} role="status">
            正在加载排行榜…
          </div>
        ) : !rows.length ? (
          <div className={styles.empty}>
            <Trophy size={24} strokeWidth={1.3} />
            <p>所选日期暂无{RANKING_LABELS[metric]}数据</p>
            {data?.latestDate && <span>最近有数据日期：{data.latestDate}，可切换日期查看</span>}
          </div>
        ) : (
          <ol
            className={styles.anchors}
            start={start + 1}
            style={{ gridTemplateColumns: `repeat(${pageSize}, minmax(0, 1fr))` }}
          >
            {rows.map((row, index) => (
              <li
                key={row.id}
                title={`${row.name} · ${RANKING_LABELS[metric]} ${metricValue(row.value, metric)}`}
              >
                <div className={styles.avatarWrap}>
                  <Portrait avatar={row.avatar} name={row.name} />
                  <span className={styles.rank} data-top={start + index < 3}>
                    {start + index + 1}
                  </span>
                </div>
                <span className={styles.name}>{row.name}</span>
                <span className={styles.value}>{metricValue(row.value, metric)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <footer className={styles.footer}>
        <span>
          {metric === "flow"
            ? "直播流水，不含短视频"
            : metric === "acu"
              ? "ACU：区间内最高日均在线人数"
              : metric === "uv"
                ? "看播 UV 按日累计，跨日不去重"
                : "累计开播时长"}
        </span>
        {data && (
          <span>
            {data.total > 100 ? `展示前 100 / ${data.total} 位主播` : `${data.total} 位主播`}
          </span>
        )}
      </footer>
    </section>
  );
}
