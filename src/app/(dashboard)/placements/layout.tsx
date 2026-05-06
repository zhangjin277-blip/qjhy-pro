import Link from "next/link";
import { Suspense } from "react";
import { FilterBar } from "./_components/filter-bar";

export default function PlacementsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4 p-4">
      {/* Top nav: only Upload + Batches */}
      <div className="flex items-center gap-1 border-b border-slate-200 pb-1">
        <span className="mr-2 text-sm font-semibold text-slate-700">投放数据</span>
        <NavLink href="/placements/upload">上传</NavLink>
        <NavLink href="/placements/batches">批次</NavLink>
      </div>

      <Suspense fallback={null}>
        <FilterBar />
      </Suspense>

      <div>{children}</div>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
    >
      {children}
    </Link>
  );
}
