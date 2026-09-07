"use client";

import { useMemo, useState } from "react";

interface Row {
  date: string;
  start: number;
  end: number;
  anchors: string[];
  cost: number;
  exposure: number;
  clicks: number;
  added: number;
}

// 灵机截图按小时录入；23 点表示 23:00—24:00。后续每天收到截图后继续追加这里的原始小时汇总。
const ROWS: Row[] = [
  {
    date: "2026-08-22",
    start: 9,
    end: 12,
    anchors: ["姜艳琪", "欧阳丽欣"],
    cost: 2991.31,
    exposure: 106725,
    clicks: 2236,
    added: 45,
  },
  {
    date: "2026-08-22",
    start: 14,
    end: 16,
    anchors: ["姜艳琪", "欧阳丽欣"],
    cost: 2162.41,
    exposure: 79296,
    clicks: 1541,
    added: 29,
  },
  {
    date: "2026-08-22",
    start: 16,
    end: 20,
    anchors: ["侯涵宇", "陆月"],
    cost: 3960.89,
    exposure: 126286,
    clicks: 2189,
    added: 57,
  },
  {
    date: "2026-08-22",
    start: 20,
    end: 22,
    anchors: ["王小坤", "蒋鑫怡"],
    cost: 1445.59,
    exposure: 19608,
    clicks: 438,
    added: 16,
  },
  {
    date: "2026-08-22",
    start: 22,
    end: 24,
    anchors: ["王小坤", "朱俊露"],
    cost: 2492.33,
    exposure: 55207,
    clicks: 1271,
    added: 30,
  },
  {
    date: "2026-08-23",
    start: 9,
    end: 12,
    anchors: ["侯涵宇", "朱俊露"],
    cost: 1392.34,
    exposure: 72209,
    clicks: 402,
    added: 24,
  },
  {
    date: "2026-08-23",
    start: 14,
    end: 16,
    anchors: ["侯涵宇", "朱俊露"],
    cost: 1379.22,
    exposure: 55207,
    clicks: 350,
    added: 26,
  },
  {
    date: "2026-08-23",
    start: 16,
    end: 20,
    anchors: ["姜艳琪", "欧阳丽欣"],
    cost: 2820.06,
    exposure: 117847,
    clicks: 792,
    added: 46,
  },
  {
    date: "2026-08-23",
    start: 20,
    end: 22,
    anchors: ["王小坤", "蒋鑫怡"],
    cost: 4.1,
    exposure: 2636,
    clicks: 25,
    added: 2,
  },
  {
    date: "2026-08-23",
    start: 22,
    end: 24,
    anchors: ["王小坤", "陆月"],
    cost: 0,
    exposure: 502,
    clicks: 7,
    added: 0,
  },
  {
    date: "2026-08-24",
    start: 9,
    end: 12,
    anchors: ["王小坤", "蒋鑫怡"],
    cost: 3307.57,
    exposure: 271151,
    clicks: 4772,
    added: 76,
  },
  {
    date: "2026-08-24",
    start: 14,
    end: 16,
    anchors: ["王小坤", "陆月"],
    cost: 1597.75,
    exposure: 86223,
    clicks: 1730,
    added: 28,
  },
  {
    date: "2026-08-24",
    start: 16,
    end: 20,
    anchors: ["姜艳琪", "欧阳丽欣"],
    cost: 5025.83,
    exposure: 197029,
    clicks: 3822,
    added: 62,
  },
  {
    date: "2026-08-24",
    start: 20,
    end: 24,
    anchors: ["侯涵宇", "朱俊露"],
    cost: 6428.58,
    exposure: 340583,
    clicks: 6249,
    added: 174,
  },
  {
    date: "2026-08-25",
    start: 9,
    end: 12,
    anchors: ["王小坤", "陆月"],
    cost: 4515.03,
    exposure: 211422,
    clicks: 4002,
    added: 72,
  },
  {
    date: "2026-08-25",
    start: 14,
    end: 16,
    anchors: ["王小坤", "蒋鑫怡"],
    cost: 2540.51,
    exposure: 144892,
    clicks: 2665,
    added: 41,
  },
  {
    date: "2026-08-25",
    start: 16,
    end: 20,
    anchors: ["姜艳琪", "欧阳丽欣"],
    cost: 4021.63,
    exposure: 205872,
    clicks: 3956,
    added: 62,
  },
  {
    date: "2026-08-25",
    start: 20,
    end: 24,
    anchors: ["侯涵宇", "朱俊露"],
    cost: 5568.17,
    exposure: 322034,
    clicks: 6332,
    added: 127,
  },
  {
    date: "2026-08-26",
    start: 9,
    end: 12,
    anchors: ["王小坤", "蒋鑫怡"],
    cost: 2515.61,
    exposure: 122348,
    clicks: 2747,
    added: 44,
  },
  {
    date: "2026-08-26",
    start: 14,
    end: 16,
    anchors: ["王小坤", "陆月"],
    cost: 1220.65,
    exposure: 39125,
    clicks: 790,
    added: 15,
  },
  {
    date: "2026-08-26",
    start: 16,
    end: 20,
    anchors: ["欧阳丽欣", "姜艳琪"],
    cost: 3486.98,
    exposure: 118464,
    clicks: 2698,
    added: 70,
  },
  {
    date: "2026-08-26",
    start: 20,
    end: 24,
    anchors: ["侯涵宇", "朱俊露"],
    cost: 4183.4,
    exposure: 244182,
    clicks: 4176,
    added: 110,
  },
  {
    date: "2026-08-27",
    start: 9,
    end: 12,
    anchors: ["姜艳琪", "欧阳丽欣"],
    cost: 7501.55,
    exposure: 446076,
    clicks: 9254,
    added: 91,
  },
  {
    date: "2026-08-27",
    start: 14,
    end: 16,
    anchors: ["姜艳琪", "欧阳丽欣"],
    cost: 2224.53,
    exposure: 154966,
    clicks: 1388,
    added: 44,
  },
  {
    date: "2026-08-27",
    start: 16,
    end: 20,
    anchors: ["王小坤", "蒋鑫怡"],
    cost: 3662.28,
    exposure: 189727,
    clicks: 3342,
    added: 63,
  },
  {
    date: "2026-08-27",
    start: 20,
    end: 24,
    anchors: ["陆月", "顾萍萍"],
    cost: 918.81,
    exposure: 102072,
    clicks: 1886,
    added: 20,
  },
  {
    date: "2026-08-28",
    start: 9,
    end: 12,
    anchors: ["欧阳丽欣", "陆月", "王小坤"],
    cost: 3000.0,
    exposure: 113340,
    clicks: 570,
    added: 29,
  },
  {
    date: "2026-08-28",
    start: 14,
    end: 16,
    anchors: ["陆月", "王小坤"],
    cost: 3888.29,
    exposure: 247940,
    clicks: 4616,
    added: 36,
  },
  {
    date: "2026-08-28",
    start: 16,
    end: 20,
    anchors: ["姜艳琪", "蒋鑫怡"],
    cost: 4827.82,
    exposure: 335149,
    clicks: 3299,
    added: 94,
  },
  {
    date: "2026-08-28",
    start: 20,
    end: 24,
    anchors: ["朱俊露", "顾萍萍"],
    cost: 834.86,
    exposure: 66584,
    clicks: 468,
    added: 19,
  },
  {
    date: "2026-08-30",
    start: 12,
    end: 16,
    anchors: ["蒋鑫怡", "王小坤"],
    cost: 5236.43,
    exposure: 602479,
    clicks: 5431,
    added: 149,
  },
  {
    date: "2026-08-30",
    start: 16,
    end: 20,
    anchors: ["顾萍萍", "陆月"],
    cost: 1607.22,
    exposure: 159342,
    clicks: 914,
    added: 39,
  },
  {
    date: "2026-08-29",
    start: 12,
    end: 16,
    anchors: ["姜艳琪", "王小坤"],
    cost: 3955.24,
    exposure: 258248,
    clicks: 2663,
    added: 51,
  },
  {
    date: "2026-08-29",
    start: 16,
    end: 20,
    anchors: ["蒋鑫怡", "陆月"],
    cost: 4776.35,
    exposure: 338824,
    clicks: 2803,
    added: 77,
  },
  {
    date: "2026-08-31",
    start: 12,
    end: 16,
    anchors: ["姜艳琪", "王小坤"],
    cost: 2620.75,
    exposure: 179807,
    clicks: 3819,
    added: 48,
  },
  {
    date: "2026-08-31",
    start: 16,
    end: 20,
    anchors: ["陆月", "蒋鑫怡"],
    cost: 3127.06,
    exposure: 244522,
    clicks: 2572,
    added: 71,
  },
];

const ANCHORS = Array.from(new Set(ROWS.flatMap((row) => row.anchors))).sort();
const HOURS = Array.from({ length: 25 }, (_, i) => i);
const money = (n: number) => `¥${n.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(2)}%` : "--");
const hourLabel = (n: number) => `${String(n).padStart(2, "0")}:00`;

export function OfficialCombinationAnalysis(): React.JSX.Element {
  const [anchor, setAnchor] = useState("");
  const [partner, setPartner] = useState("");
  const [from, setFrom] = useState("2026-08-22");
  const [to, setTo] = useState("2026-08-30");
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(24);

  const filtered = useMemo(
    () =>
      ROWS.filter((row) => {
        const includesAnchor = !anchor || row.anchors.includes(anchor);
        const includesPartner = !partner || row.anchors.includes(partner);
        const inDate = row.date >= from && row.date <= to;
        const inTime =
          start <= end ? row.start < end && row.end > start : row.start >= start || row.end <= end;
        return includesAnchor && includesPartner && inDate && inTime;
      }),
    [anchor, partner, from, to, start, end],
  );

  const totals = filtered.reduce(
    (a, row) => ({
      cost: a.cost + row.cost,
      exposure: a.exposure + row.exposure,
      clicks: a.clicks + row.clicks,
      added: a.added + row.added,
    }),
    { cost: 0, exposure: 0, clicks: 0, added: 0 },
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">主播组合分析</h3>
          <p className="mt-1 text-xs text-slate-500">
            按班次整体表现统计，不拆分个人贡献；投放数据按小时录入。
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500">
          已录入 8月22日—31日
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <label className="text-xs text-slate-500">
          主播
          <select
            value={anchor}
            onChange={(e) => setAnchor(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border px-2 text-sm text-slate-800"
          >
            <option value="">全部主播</option>
            {ANCHORS.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          搭档（可选）
          <select
            value={partner}
            onChange={(e) => setPartner(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border px-2 text-sm text-slate-800"
          >
            <option value="">全部搭档</option>
            {ANCHORS.filter((name) => name !== anchor).map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          开始时间
          <select
            value={start}
            onChange={(e) => setStart(Number(e.target.value))}
            className="mt-1 h-9 w-full rounded-md border px-2 text-sm text-slate-800"
          >
            {HOURS.slice(0, 24).map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          结束时间
          <select
            value={end}
            onChange={(e) => setEnd(Number(e.target.value))}
            className="mt-1 h-9 w-full rounded-md border px-2 text-sm text-slate-800"
          >
            {HOURS.slice(1).map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          开始日期
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border px-2 text-sm text-slate-800"
          />
        </label>
        <label className="text-xs text-slate-500">
          结束日期
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border px-2 text-sm text-slate-800"
          />
        </label>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["班次数", String(filtered.length)],
          ["总消耗", money(totals.cost)],
          ["总新增", totals.added.toLocaleString()],
          ["新增成本", totals.added ? money(totals.cost / totals.added) : "--"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-slate-50 p-3">
            <div className="text-[11px] text-slate-500">{label}</div>
            <div className="mt-1 text-base font-semibold text-slate-900">{value}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="border-b text-slate-500">
            <tr>
              {["主播组合", "日期", "时段", "消耗", "新增", "新增成本", "点击率", "转化率"].map(
                (h) => (
                  <th key={h} className="px-2 py-2 font-medium">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={`${row.date}-${row.start}-${row.anchors.join("-")}`}
                className="border-b last:border-0"
              >
                <td className="px-2 py-2 font-medium text-slate-800">{row.anchors.join(" + ")}</td>
                <td className="px-2 py-2 text-slate-600">{row.date}</td>
                <td className="px-2 py-2 text-slate-600">
                  {hourLabel(row.start)}–{hourLabel(row.end === 24 ? 24 : row.end)}
                </td>
                <td className="px-2 py-2 text-slate-700">{money(row.cost)}</td>
                <td className="px-2 py-2 text-slate-700">{row.added}</td>
                <td className="px-2 py-2 text-slate-700">
                  {row.added ? money(row.cost / row.added) : "--"}
                </td>
                <td className="px-2 py-2 text-slate-700">{pct(row.clicks, row.exposure)}</td>
                <td className="px-2 py-2 text-slate-700">{pct(row.added, row.clicks)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-8 text-center text-xs text-slate-400">没有符合筛选条件的班次</div>
        )}
      </div>
    </section>
  );
}
