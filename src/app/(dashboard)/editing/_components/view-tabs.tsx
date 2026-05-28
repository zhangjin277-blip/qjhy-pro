"use client";
import Link from "next/link";

const TABS = [
  { label: "看板", href: "/editing" },
  { label: "表格", href: "/editing/table" },
  { label: "甘特", href: "/editing/gantt" },
  { label: "统计", href: "/editing/stats" },
];

export function ViewTabs({ active }: { active: "board" | "table" | "gantt" | "stats" }) {
  const activeHref = {
    board: "/editing",
    table: "/editing/table",
    gantt: "/editing/gantt",
    stats: "/editing/stats",
  }[active];

  return (
    <div className="inline-flex rounded-md bg-slate-100 p-0.5">
      {TABS.map((t) => {
        const isActive = t.href === activeHref;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              isActive
                ? "rounded bg-white px-3.5 py-1.5 text-sm font-medium text-blue-600 shadow-sm"
                : "rounded px-3.5 py-1.5 text-sm text-slate-500 hover:text-slate-700"
            }
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
