"use client";

import { useMemo, useState, useTransition } from "react";
import type { CheckinDayResult } from "@/modules/checkin/queries";
import { fetchCheckinDay } from "../actions";
import { CheckinGantt } from "./checkin-gantt";
import { CheckinTable } from "./checkin-table";

interface Props {
  initialData: CheckinDayResult;
  initialDate: string;
  initialProduct: string;
  canForceEnd: boolean;
}

const PRODUCTS = [
  { value: "", label: "全部" },
  { value: "捕鱼大作战", label: "捕鱼大作战" },
  { value: "途游休闲捕鱼", label: "途游休闲捕鱼" },
  { value: "电玩捕鱼", label: "电玩捕鱼" },
];

export function CheckinHistoryClient({
  initialData,
  initialDate,
  initialProduct,
  canForceEnd,
}: Props): React.JSX.Element {
  const [date, setDate] = useState(initialDate);
  const [product, setProduct] = useState(initialProduct);
  const [accountQuery, setAccountQuery] = useState("");
  const [data, setData] = useState<CheckinDayResult>(initialData);
  const [isPending, startTransition] = useTransition();

  const filteredData = useMemo<CheckinDayResult>(() => {
    const q = accountQuery.trim().toLowerCase();
    if (!q) return data;
    return {
      ...data,
      accounts: data.accounts.filter((a) => {
        if (a.account_name.toLowerCase().includes(q)) return true;
        if (a.placement_label && a.placement_label.toLowerCase().includes(q)) return true;
        return false;
      }),
    };
  }, [data, accountQuery]);

  function refresh(d: string, p: string): void {
    startTransition(async () => {
      const r = await fetchCheckinDay(d, p);
      if (r) setData(r);
    });
  }

  function onDateChange(d: string): void {
    setDate(d);
    refresh(d, product);
  }
  function onProductChange(p: string): void {
    setProduct(p);
    refresh(date, p);
  }

  const stats = useMemo(() => {
    let totalSessions = 0;
    let totalSeconds = 0;
    let inProgress = 0;
    const anchorSet = new Set<string>();
    for (const acc of filteredData.accounts) {
      for (const s of acc.sessions) {
        totalSessions++;
        if (s.status === "in_progress") inProgress++;
        else if (s.duration_seconds) totalSeconds += s.duration_seconds;
        anchorSet.add(s.anchor_dingtalk_user_id);
      }
    }
    return {
      totalSessions,
      totalHours: (totalSeconds / 3600).toFixed(1),
      inProgress,
      anchorCount: anchorSet.size,
      accountCount: filteredData.accounts.length,
    };
  }, [filteredData]);

  function downloadCsv(): void {
    const rows: string[][] = [
      [
        "产品",
        "账号",
        "平台",
        "主播",
        "开始时间",
        "结束时间",
        "时长(min)",
        "礼物流水(元)",
        "消耗(元)",
        "激活",
        "激活单价",
        "付费(元)",
        "ARPU",
        "状态",
        "关闭方式",
      ],
    ];
    for (const acc of filteredData.accounts) {
      for (const s of acc.sessions) {
        const cpa =
          s.cost_yuan != null && s.activations != null && s.activations > 0
            ? (s.cost_yuan / s.activations).toFixed(2)
            : "";
        const arpu =
          s.payment_yuan != null && s.activations != null && s.activations > 0
            ? (s.payment_yuan / s.activations).toFixed(2)
            : "";
        rows.push([
          acc.product,
          acc.account_name,
          acc.platform,
          s.anchor_name,
          new Date(s.start_at).toLocaleString("zh-CN"),
          s.end_at ? new Date(s.end_at).toLocaleString("zh-CN") : "",
          s.duration_seconds != null ? Math.round(s.duration_seconds / 60).toString() : "",
          s.income_cents != null ? (s.income_cents / 100).toFixed(2) : "",
          s.cost_yuan != null ? s.cost_yuan.toFixed(2) : "",
          s.activations != null ? Math.round(s.activations).toString() : "",
          cpa,
          s.payment_yuan != null ? s.payment_yuan.toFixed(2) : "",
          arpu,
          s.status,
          s.closed_by ?? "",
        ]);
      }
    }
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `checkin-history-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <label className="flex items-center gap-2 text-[12.5px] text-slate-600">
          日期
          <input
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </label>
        <label className="flex items-center gap-2 text-[12.5px] text-slate-600">
          产品
          <select
            value={product}
            onChange={(e) => onProductChange(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {PRODUCTS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[12.5px] text-slate-600">
          账号
          <input
            type="search"
            value={accountQuery}
            onChange={(e) => setAccountQuery(e.target.value)}
            placeholder="搜索账号名 / 投放标签"
            className="w-44 rounded border border-slate-300 px-2 py-1 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {accountQuery && (
            <button
              type="button"
              onClick={() => setAccountQuery("")}
              className="text-[11px] text-slate-400 hover:text-slate-600"
            >
              清除
            </button>
          )}
        </label>
        <span className="text-[11.5px] text-slate-400">
          {isPending
            ? "加载中..."
            : `${stats.accountCount} 账号 / ${stats.totalSessions} 场次 / ${stats.anchorCount} 主播 / 累计 ${stats.totalHours} 小时${stats.inProgress > 0 ? ` / 进行中 ${stats.inProgress}` : ""}`}
        </span>
        <div className="ml-auto">
          <button
            type="button"
            onClick={downloadCsv}
            className="rounded border border-slate-300 bg-white px-3 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
          >
            导出 CSV
          </button>
        </div>
      </div>

      {/* Gantt */}
      {filteredData.accounts.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-[13px] text-slate-400">
          {accountQuery ? `没有匹配「${accountQuery}」的账号` : "当日暂无开播记录"}
        </div>
      ) : (
        <>
          <CheckinGantt data={filteredData} />
          <CheckinTable
            data={filteredData}
            canForceEnd={canForceEnd}
            onChanged={() => refresh(date, product)}
          />
        </>
      )}
    </div>
  );
}
