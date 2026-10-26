"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BUYU_PRODUCTS,
  buyuAccountDetails,
  resolveBuyuTaskRoi,
  summarizeBuyuProduct,
  type BuyuDailyRow,
} from "@/modules/buyu/live-summary";
import { formatChineseNumber } from "./format";
import styles from "./business-board.module.css";

interface Props {
  dateFrom: string;
  dateTo: string;
}

export function BuyuSection({ dateFrom, dateTo }: Props): React.JSX.Element {
  const [source, setSource] = useState<{
    from: string;
    to: string;
    daily: BuyuDailyRow[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storedTargets, setStoredTargets] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ product: string; qualified: boolean } | null>(null);
  const targets = resolveBuyuTaskRoi(dateTo, storedTargets);
  const data = source?.from === dateFrom && source.to === dateTo ? source : null;
  const rows = data?.daily.filter((row) => row.date >= dateFrom && row.date <= dateTo) ?? [];

  useEffect(() => {
    const readTargets = () => {
      try {
        setStoredTargets(window.localStorage.getItem("buyu-task-roi-by-month"));
      } catch {
        setStoredTargets(null);
      }
    };
    readTargets();
    window.addEventListener("storage", readTargets);
    window.addEventListener("focus", readTargets);
    return () => {
      window.removeEventListener("storage", readTargets);
      window.removeEventListener("focus", readTargets);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    // 与「捕鱼中心 → 捕鱼直播」使用相同接口和日期参数，权限也由该接口校验。
    const params = new URLSearchParams({
      date_from: dateFrom,
      date_to: dateTo,
    });
    fetch(`/api/projects/buyu/overview?${params}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 403) throw new Error("暂无捕鱼直播查看权限");
          if (res.status === 401) throw new Error("登录已失效，请重新登录");
          throw new Error("捕鱼直播数据加载失败，请重试");
        }
        return res.json() as Promise<{ daily: BuyuDailyRow[] }>;
      })
      .then((json) => {
        if (!cancelled) setSource({ from: dateFrom, to: dateTo, daily: json.daily ?? [] });
      })
      .catch((reason: unknown) => {
        if (cancelled || (reason instanceof DOMException && reason.name === "AbortError")) return;
        setError(reason instanceof Error ? reason.message : "加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [dateFrom, dateTo]);

  return (
    <section className={styles.panel} aria-label="捕鱼直播经营概览">
      <header className={styles.panelHeader}>
        <div>
          <h2>
            <i />
            捕鱼直播 · 经营概览
          </h2>
          <p>捕鱼中心数据 · 与上方统计日期联动</p>
        </div>
        <Link href="/projects/buyu" className={styles.buyuLink}>
          捕鱼直播 →
        </Link>
      </header>
      {error ? (
        <p role="alert" className={styles.empty}>
          {error}
        </p>
      ) : loading || !data ? (
        <div className={styles.empty}>正在加载捕鱼直播数据…</div>
      ) : (
        <div className={styles.buyuBody}>
          <div className={styles.buyuHead}>
            <span>产品</span>
            <span>消耗</span>
            <span>新增</span>
            <span>CPI</span>
            <span>达标账号</span>
          </div>
          {BUYU_PRODUCTS.map((product) => {
            const target = targets[product] ?? 0;
            const summary = summarizeBuyuProduct(rows, product, target);
            const counts = summary.achievement;
            return (
              <div key={product} className={styles.buyuProduct}>
                <button
                  type="button"
                  className={styles.buyuRow}
                  aria-label={`${product}账号明细`}
                  onClick={() => setDetail({ product, qualified: false })}
                >
                  <span className={styles.productBadge}>{product}</span>
                  <span>
                    <strong>¥{formatChineseNumber(summary.cost)}</strong>
                  </span>
                  <span>
                    <strong>{formatChineseNumber(summary.additions)}</strong>
                  </span>
                  <span>
                    <strong>{summary.cpi == null ? "—" : `¥${summary.cpi.toFixed(2)}`}</strong>
                  </span>
                  <span className={styles.buyuQualified}>
                    <strong>{counts.target} 个</strong>
                    <small>目标 {(target * 100).toFixed(1)}%</small>
                  </span>
                </button>
                <div className={styles.buyuAchievement}>
                  <button
                    type="button"
                    onClick={() => setDetail({ product, qualified: true })}
                    aria-label={`查看${product}达标账号（${counts.target}个）`}
                  >
                    查看达标账号 →
                  </button>
                  <span className={styles.buyuNinety}>90%+ {counts.ninety}</span>
                  <span className={styles.buyuEighty}>80%+ {counts.eighty}</span>
                  <span className={styles.buyuBelow}>未达标 {counts.below}</span>
                  {counts.unknown > 0 && <span>待确认 {counts.unknown}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <footer className={styles.buyuFoot}>
        <span>指标及达标统计不含外部账号 · 月度 ROI 口径同捕鱼直播</span>
        <span>{dateFrom === dateTo ? dateTo : `${dateFrom} 至 ${dateTo}`}</span>
      </footer>
      <ProductDetailDialog
        detail={data && !loading && !error ? detail : null}
        rows={rows}
        targets={targets}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onClose={() => setDetail(null)}
        onFilterChange={(qualified) => setDetail((current) => current && { ...current, qualified })}
      />
    </section>
  );
}

function ProductDetailDialog({
  detail,
  rows,
  targets,
  dateFrom,
  dateTo,
  onClose,
  onFilterChange,
}: {
  detail: { product: string; qualified: boolean } | null;
  rows: BuyuDailyRow[];
  targets: Record<string, number>;
  dateFrom: string;
  dateTo: string;
  onClose: () => void;
  onFilterChange: (qualified: boolean) => void;
}): React.JSX.Element {
  const target = detail ? (targets[detail.product] ?? null) : null;
  const accounts = detail ? buyuAccountDetails(rows, detail.product, target) : [];
  const visible = detail?.qualified
    ? accounts.filter(
        (account) =>
          !account.external &&
          account.sevenDayRoi != null &&
          target != null &&
          account.sevenDayRoi >= target,
      )
    : accounts;
  const percent = (value: number | null) => (value == null ? "—" : `${(value * 100).toFixed(2)}%`);
  return (
    <Dialog open={detail !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-4xl sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{detail?.product} 账号数据</DialogTitle>
          <DialogDescription>
            {dateFrom} 至 {dateTo} · 7日净 ROI 目标 {percent(target)}
            ，口径同捕鱼直播。账号指标取区间内最新日报。
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={!detail?.qualified}
            onClick={() => onFilterChange(false)}
            className="rounded border px-3 py-1 text-xs aria-pressed:bg-blue-50 aria-pressed:text-blue-700"
          >
            全部账号
          </button>
          <button
            type="button"
            aria-pressed={detail?.qualified ?? false}
            onClick={() => onFilterChange(true)}
            className="rounded border px-3 py-1 text-xs aria-pressed:bg-emerald-50 aria-pressed:text-emerald-700"
          >
            达标账号
          </button>
        </div>
        <div className="max-h-[65dvh] overflow-auto rounded-md border border-slate-200">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="sticky top-0 bg-slate-800 text-white">
              <tr>
                {["账号", "消耗", "新增", "CPI", "7日净ROI", "达成率", "状态"].map((label) => (
                  <th
                    key={label}
                    className="whitespace-nowrap px-4 py-3 text-right first:text-left"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((account) => (
                <tr key={account.name} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">
                    {account.name}
                    {account.external ? "（外部）" : ""}
                  </td>
                  <td className="px-4 py-3 text-right">
                    ¥{account.cost.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {account.additions.toLocaleString("zh-CN")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {account.cpi == null ? "—" : `¥${account.cpi.toFixed(2)}`}
                  </td>
                  <td className="px-4 py-3 text-right">{percent(account.sevenDayRoi)}</td>
                  <td className="px-4 py-3 text-right">{percent(account.achievementRate)}</td>
                  <td className="px-4 py-3 text-right">
                    {account.external
                      ? "不参与考核"
                      : account.sevenDayRoi == null
                        ? "待确认"
                        : target != null && account.sevenDayRoi >= target
                          ? "达标"
                          : target != null && account.sevenDayRoi >= target * 0.9
                            ? "90%+"
                            : target != null && account.sevenDayRoi >= target * 0.8
                              ? "80%+"
                              : "未达标"}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    {detail?.qualified ? "该日期范围内暂无达标账号" : "该日期范围内暂无账号日报"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
