"use client";

import { useEffect, useMemo, useState } from "react";
import { OfficialCombinationAnalysis } from "./official-combination-analysis";
import { classifyAdHour } from "../_lib/ad-schedule-attribution";

interface Day {
  date: string;
  cost: number;
  exposure: number;
  clicks: number;
  added: number;
  firstDayPayment: number;
}
interface Hour extends Day {
  hour: number;
}

/* legacy daily snapshots retained in database now
const DAYS: Day[] = [
  { date: "2026-08-22", cost: 13052.53, exposure: 387122, clicks: 7675, added: 177, firstDayPayment: 0 },
  { date: "2026-08-23", cost: 5595.72, exposure: 248401, clicks: 1576, added: 98, firstDayPayment: 0 },
  { date: "2026-08-24", cost: 16359.73, exposure: 894986, clicks: 16573, added: 340, firstDayPayment: 0 },
  { date: "2026-08-25", cost: 16645.34, exposure: 884220, clicks: 16955, added: 302, firstDayPayment: 0 },
  { date: "2026-08-26", cost: 11418.76, exposure: 529726, clicks: 10259, added: 234, firstDayPayment: 66 },
  { date: "2026-08-27", cost: 14307.17, exposure: 897000, clicks: 15903, added: 218, firstDayPayment: 126 },
  { date: "2026-08-28", cost: 12550.97, exposure: 763503, clicks: 8954, added: 180, firstDayPayment: 412 },
  { date: "2026-08-29", cost: 8731.74, exposure: 599203, clicks: 5468, added: 128, firstDayPayment: 674 },
  { date: "2026-08-30", cost: 6843.65, exposure: 761821, clicks: 6345, added: 188, firstDayPayment: 2970 },
  { date: "2026-08-31", cost: 6205.32, exposure: 436648, clicks: 6561, added: 122, firstDayPayment: 138 },
]; */
// 小时明细由 Excel 导入数据库；未导入的日期会提示暂无明细。

const n = (v: number) => v.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
const money = (v: number) => `¥${v.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
const localDate = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
function presetRange(kind: "7" | "30" | "month" | "prev"): [string, string] {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (kind === "month")
    return [localDate(new Date(end.getFullYear(), end.getMonth(), 1)), localDate(end)];
  if (kind === "prev")
    return [
      localDate(new Date(end.getFullYear(), end.getMonth() - 1, 1)),
      localDate(new Date(end.getFullYear(), end.getMonth(), 0)),
    ];
  const days = kind === "7" ? 6 : 29;
  const start = new Date(end);
  start.setDate(end.getDate() - days);
  return [localDate(start), localDate(end)];
}

export function OfficialAdDataPanel(): React.JSX.Element {
  const [from, setFrom] = useState(() => presetRange("30")[0]);
  const [to, setTo] = useState(() => presetRange("30")[1]);
  const [date, setDate] = useState("");
  const [startHour, setStartHour] = useState(0);
  const [endHour, setEndHour] = useState(24);
  const [dbHourly, setDbHourly] = useState<Hour[]>([]);
  const [uploadDate, setUploadDate] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const loadData = () => {
    Promise.all([
      fetch("/api/projects/zhaohua/official-ad-data/import", { cache: "no-store" }).then(
        async (response) => {
          if (!response.ok) throw new Error("load failed");
          return response.json() as Promise<{
            states?: { payload?: { date?: string; rows?: Hour[] } }[];
          }>;
        },
      ),
      fetch("/api/projects/zhaohua/shared-state/official_shifts", { cache: "no-store" }).then(
        (response) => (response.ok ? response.json() : { payload: [] }),
      ),
      fetch("/api/projects/zhaohua/shared-state/ecology_roster", { cache: "no-store" }).then(
        (response) => (response.ok ? response.json() : { payload: { anchors: [] } }),
      ),
    ])
      .then(([body, officialBody, rosterBody]) => {
        const officialShifts = Array.isArray(officialBody.payload) ? officialBody.payload : [];
        const auctionRoster = Array.isArray(rosterBody.payload?.anchors)
          ? rosterBody.payload.anchors
          : [];
        const unique = new Map<string, Hour>();
        for (const state of body.states ?? []) {
          for (const row of state.payload?.rows ?? []) {
            const normalized = { ...row, date: state.payload?.date ?? row.date };
            if (classifyAdHour(normalized, officialShifts, auctionRoster) === "official") {
              unique.set(`${normalized.date}-${normalized.hour}`, normalized);
            }
          }
        }
        setDbHourly(Array.from(unique.values()));
      })
      .catch(() => setDbHourly([]));
  };
  useEffect(loadData, []);
  const sourceHours = dbHourly;
  const rows = useMemo(() => {
    const grouped = new Map<string, Day>();
    for (const h of dbHourly) {
      const current = grouped.get(h.date) ?? {
        date: h.date,
        cost: 0,
        exposure: 0,
        clicks: 0,
        added: 0,
        firstDayPayment: 0,
      };
      current.cost += h.cost;
      current.exposure += h.exposure;
      current.clicks += h.clicks;
      current.added += h.added;
      current.firstDayPayment += (h as Hour & { firstDayPayment?: number }).firstDayPayment ?? 0;
      grouped.set(h.date, current);
    }
    return Array.from(grouped.values())
      .filter((d) => d.date >= from && d.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [dbHourly, from, to]);
  const selectedHours = useMemo(
    () =>
      sourceHours.filter(
        (h) => (!date || h.date === date) && h.hour >= startHour && h.hour < endHour,
      ),
    [sourceHours, date, startHour, endHour],
  );
  const timeFiltered = startHour > 0 || endHour < 24;
  const displayRows = useMemo(
    () =>
      timeFiltered
        ? rows.map((day) => {
            const hs = sourceHours.filter(
              (h) => h.date === day.date && h.hour >= startHour && h.hour < endHour,
            );
            return hs.length
              ? {
                  ...day,
                  cost: hs.reduce((s, h) => s + h.cost, 0),
                  exposure: hs.reduce((s, h) => s + h.exposure, 0),
                  clicks: hs.reduce((s, h) => s + h.clicks, 0),
                  added: hs.reduce((s, h) => s + h.added, 0),
                  firstDayPayment: hs.reduce(
                    (s, h) => s + ((h as Hour & { firstDayPayment?: number }).firstDayPayment ?? 0),
                    0,
                  ),
                }
              : { ...day, cost: 0, exposure: 0, clicks: 0, added: 0, firstDayPayment: 0 };
          })
        : rows,
    [rows, sourceHours, startHour, endHour, timeFiltered],
  );
  const total = displayRows.reduce(
    (a, d) => ({
      cost: a.cost + d.cost,
      exposure: a.exposure + d.exposure,
      clicks: a.clicks + d.clicks,
      added: a.added + d.added,
      firstDayPayment: a.firstDayPayment + d.firstDayPayment,
    }),
    { cost: 0, exposure: 0, clicks: 0, added: 0, firstDayPayment: 0 },
  );
  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">官号投放数据</h3>
            <p className="mt-1 text-xs text-slate-500">
              灵机后台 · 点击日期查看小时明细，默认全天汇总
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex rounded-md bg-slate-100 p-0.5">
              {[
                ["7", "近7天"],
                ["30", "近30天"],
                ["month", "本月"],
                ["prev", "上月"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    const [f, t] = presetRange(key as "7" | "30" | "month" | "prev");
                    setFrom(f);
                    setTo(t);
                  }}
                  className="rounded px-2 py-1 text-slate-600 hover:bg-white hover:text-slate-900"
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 rounded-md border px-2"
            />
            <span>至</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 rounded-md border px-2"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-300 p-3 text-xs">
          <span className="font-medium text-slate-700">导入 Excel</span>
          <input
            type="date"
            value={uploadDate}
            onChange={(e) => setUploadDate(e.target.value)}
            className="h-8 rounded-md border px-2"
          />
          <input
            type="file"
            accept=".xlsx,.xls"
            id="official-ad-file"
            className="max-w-[220px] text-xs"
          />
          <button
            type="button"
            disabled={uploading}
            onClick={async () => {
              const input = document.getElementById("official-ad-file") as HTMLInputElement;
              if (!uploadDate || !input.files?.[0]) {
                setUploadMessage("请选择日期和 Excel 文件");
                return;
              }
              setUploading(true);
              setUploadMessage("");
              const fd = new FormData();
              fd.append("date", uploadDate);
              fd.append("file", input.files[0]);
              const response = await fetch("/api/projects/zhaohua/official-ad-data/import", {
                method: "POST",
                body: fd,
              });
              const body = (await response.json()) as { error?: string };
              setUploading(false);
              setUploadMessage(response.ok ? "导入成功" : (body.error ?? "导入失败"));
              if (response.ok) {
                setFrom(uploadDate);
                setTo(uploadDate);
                setDate(uploadDate);
                loadData();
              }
            }}
            className="h-8 rounded-md bg-slate-900 px-3 font-medium text-white disabled:opacity-50"
          >
            {uploading ? "导入中" : "上传并导入"}
          </button>
          {uploadMessage ? <span className="text-slate-500">{uploadMessage}</span> : null}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3">
          <label className="text-xs text-slate-500">
            日期
            <select
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 h-8 rounded-md border bg-white px-2"
            >
              <option value="">全部日期</option>
              {rows.map((d) => (
                <option key={d.date}>{d.date}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            时段
            <select
              value={startHour}
              onChange={(e) => setStartHour(Number(e.target.value))}
              className="mt-1 h-8 rounded-md border bg-white px-2"
            >
              <option value={0}>全天</option>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h + 1} value={h}>
                  {String(h).padStart(2, "0")}:00 起
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            结束
            <select
              value={endHour}
              onChange={(e) => setEndHour(Number(e.target.value))}
              className="mt-1 h-8 rounded-md border bg-white px-2"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h + 1} value={h + 1}>
                  {String(h + 1).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </label>
          <span className="pb-2 text-[11px] text-slate-400">
            {date && timeFiltered
              ? `${String(startHour).padStart(2, "0")}:00—${String(endHour).padStart(2, "0")}:00 汇总`
              : "全天"}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
          {[
            ["总消耗", money(total.cost)],
            ["总曝光", n(total.exposure)],
            ["总点击", n(total.clicks)],
            ["总新增", n(total.added)],
            ["首日充值", money(total.firstDayPayment)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-slate-50 p-3">
              <div className="text-[11px] text-slate-500">{label}</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="border-b text-slate-500">
              <tr>
                {[
                  "日期",
                  "时段",
                  "消耗",
                  "曝光",
                  "点击",
                  "新增",
                  "首日充值",
                  "新增成本",
                  "点击率",
                ].map((h) => (
                  <th key={h} className="px-2 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((d) => (
                <tr
                  key={d.date}
                  onClick={() => setDate(d.date)}
                  className={`cursor-pointer border-b last:border-0 hover:bg-blue-50 ${date === d.date ? "bg-blue-50" : ""}`}
                >
                  <td className="px-2 py-2 font-medium text-slate-700">{d.date}</td>
                  <td className="px-2 py-2 text-slate-500">
                    {timeFiltered
                      ? `${String(startHour).padStart(2, "0")}:00—${String(endHour).padStart(2, "0")}:00`
                      : "全天"}
                  </td>
                  <td className="px-2 py-2">{money(d.cost)}</td>
                  <td className="px-2 py-2">{n(d.exposure)}</td>
                  <td className="px-2 py-2">{n(d.clicks)}</td>
                  <td className="px-2 py-2">{n(d.added)}</td>
                  <td className="px-2 py-2">{money(d.firstDayPayment)}</td>
                  <td className="px-2 py-2">{d.added ? money(d.cost / d.added) : "--"}</td>
                  <td className="px-2 py-2">
                    {d.exposure ? `${((d.clicks / d.exposure) * 100).toFixed(2)}%` : "--"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {date ? (
          <div className="mt-4 rounded-lg border border-slate-200 p-3">
            <div className="mb-2 text-xs font-medium text-slate-700">{date} · 小时明细</div>
            {selectedHours.length ? (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {selectedHours.map((h) => (
                  <div key={h.hour} className="rounded-md bg-slate-50 p-2 text-xs">
                    <div className="text-slate-500">
                      {String(h.hour).padStart(2, "0")}:00—{String(h.hour + 1).padStart(2, "0")}:00
                    </div>
                    <div className="mt-1 font-medium">
                      {money(h.cost)} · 新增 {h.added}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">该日期暂无小时明细</p>
            )}
          </div>
        ) : null}
      </section>
      <OfficialCombinationAnalysis />
    </div>
  );
}
