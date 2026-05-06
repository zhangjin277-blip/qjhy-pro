"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/placements/by-account", label: "按账号" },
  { href: "/placements/by-anchor", label: "按主播" },
  { href: "/placements/by-hour", label: "时段矩阵" },
  { href: "/placements/upload", label: "上传" },
  { href: "/placements/batches", label: "批次" },
];

export function BoardTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 border-b border-slate-200">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3 py-2 text-sm font-medium ${
              active
                ? "border-b-2 border-blue-600 text-blue-700"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
