"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronsLeft, ChevronsRight, Radio, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { filterNavByVisibility, findActiveSectionKey, isHrefActive, type NavItem } from "@/lib/nav";
import type { ModuleKey } from "@/modules/permissions";

interface SidebarProps {
  defaultCollapsed: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
  /** server 端算好的可见 module key 数组（plain string，可跨 server→client） */
  visibleModules: ModuleKey[];
  /** emergency 全开 */
  bypassPerms: boolean;
}

export function Sidebar({
  defaultCollapsed,
  mobileOpen,
  onMobileClose,
  visibleModules,
  bypassPerms,
}: SidebarProps) {
  const nav: NavItem[] = useMemo(
    () => filterNavByVisibility(new Set(visibleModules), bypassPerms),
    [visibleModules, bypassPerms],
  );
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const activeSection = useMemo(() => findActiveSectionKey(pathname), [pathname]);

  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    const init = new Set<string>();
    if (activeSection) init.add(activeSection);
    return init;
  });

  // 路径变化时确保对应 section 展开
  useEffect(() => {
    if (activeSection) {
      setOpenSections((prev) => {
        if (prev.has(activeSection)) return prev;
        const next = new Set(prev);
        next.add(activeSection);
        return next;
      });
    }
  }, [activeSection]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `sidebar-collapsed=${next};path=/;max-age=${365 * 24 * 3600};samesite=lax`;
  }

  function toggleSection(key: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <>
      {/* 桌面 sidebar — bg-transparent 透出外层 slate-50（PRO3 风格） */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col bg-transparent transition-[width] duration-200 lg:flex",
          collapsed ? "w-14" : "w-[212px]",
        )}
      >
        <SidebarInner
          nav={nav}
          showLabels={!collapsed}
          openSections={openSections}
          toggleSection={toggleSection}
          pathname={pathname}
          collapsed={collapsed}
          toggleCollapsed={toggleCollapsed}
        />
      </aside>

      {/* 移动端抽屉 */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={onMobileClose}>
          <div className="bg-foreground/40 absolute inset-0" />
          <aside
            className="bg-card absolute inset-y-0 left-0 flex h-dvh w-[212px] flex-col border-r"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onMobileClose}
              className="hover:bg-muted absolute top-3 right-3 z-10 rounded p-1"
              aria-label="关闭菜单"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarInner
              nav={nav}
              showLabels
              openSections={openSections}
              toggleSection={toggleSection}
              pathname={pathname}
              collapsed={false}
              toggleCollapsed={toggleCollapsed}
              onItemClick={onMobileClose}
            />
          </aside>
        </div>
      )}
    </>
  );
}

interface SidebarInnerProps {
  nav: NavItem[];
  showLabels: boolean;
  openSections: Set<string>;
  toggleSection: (key: string) => void;
  pathname: string;
  collapsed: boolean;
  toggleCollapsed: () => void;
  onItemClick?: () => void;
}

function BackendSwitcher() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-0.5 rounded text-[11px] text-primary hover:bg-primary/10 px-1 py-0.5"
      >
        切换
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[160px] rounded-lg border border-border bg-white p-1 shadow-lg">
          <div className="flex items-center gap-2 rounded px-2 py-1.5 bg-primary/10 text-primary text-[12px]">
            <Check className="h-3.5 w-3.5" />
            <span className="font-medium">新后台</span>
            <span className="ml-auto text-[10px] text-primary/60">当前</span>
          </div>
          <a
            href="http://qjhypro.cn:8888/"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"
          >
            <span className="h-3.5 w-3.5" />
            <span>老后台</span>
          </a>
        </div>
      )}
    </div>
  );
}

function SidebarInner({
  nav,
  showLabels,
  openSections,
  toggleSection,
  pathname,
  collapsed,
  toggleCollapsed,
  onItemClick,
}: SidebarInnerProps) {
  return (
    <>
      {/* 品牌 */}
      <div className="flex h-14 items-center gap-2 px-2.5">
        <div className="from-primary to-primary/70 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br shadow-sm ring-1 ring-white/30 ring-inset">
          <Radio className="h-4 w-4 text-white" strokeWidth={2.4} />
        </div>
        {showLabels && (
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-semibold">直播服务平台</span>
              <BackendSwitcher />
            </div>
            <span className="truncate text-[10px] text-muted-foreground">长沙奇迹互娱</span>
          </div>
        )}
      </div>

      {/* 导航 */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
        {nav.map((sec) => {
          const Icon = sec.icon;

          if (sec.single) {
            const active = isHrefActive(sec.href, pathname);
            return (
              <Link
                key={sec.key}
                href={sec.href}
                onClick={onItemClick}
                className={cn(
                  "flex h-8.5 items-center gap-2 rounded px-2.5 text-[13px] transition-colors",
                  active
                    ? "text-[var(--selection-primary)] font-medium"
                    : "text-foreground/80 hover:bg-[var(--hover-bg)] hover:text-[var(--selection-primary)]",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {showLabels && <span>{sec.label}</span>}
              </Link>
            );
          }

          const visibleChildren = sec.children.filter((it) => !it.disabled);
          if (visibleChildren.length === 0) {
            return null;
          }

          const open = openSections.has(sec.key);
          const sectionActive = visibleChildren.some((it) => isHrefActive(it.href, pathname));
          return (
            <div key={sec.key} className="mb-1 rounded-md transition-colors hover:bg-black/[0.035]">
              <button
                type="button"
                onClick={() => showLabels && toggleSection(sec.key)}
                className={cn(
                  "flex h-8.5 w-full items-center gap-2 rounded px-2.5 text-[13px] transition-colors",
                  sectionActive
                    ? "text-[var(--selection-primary)] font-medium"
                    : "text-foreground/80 hover:text-[var(--selection-primary)]",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {showLabels && (
                  <>
                    <span className="flex-1 text-left font-medium">{sec.label}</span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform",
                        sectionActive ? "text-[var(--selection-primary)]" : "text-muted-foreground",
                        open ? "rotate-0" : "-rotate-90",
                      )}
                    />
                  </>
                )}
              </button>
              {open && showLabels && (
                <div className="mt-0.5 grid grid-cols-2 gap-0.5 pl-[26px]">
                  {visibleChildren.map((it) => {
                    const active = isHrefActive(it.href, pathname);
                    return (
                      <Link
                        key={it.key}
                        href={it.href}
                        onClick={onItemClick}
                        className={cn(
                          "truncate rounded px-1.5 py-1.5 text-left text-[11px] transition-colors",
                          active
                            ? "text-[var(--selection-primary)] font-medium"
                            : "text-sidebar-leaf-foreground hover:text-[var(--selection-primary)]",
                        )}
                      >
                        {it.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* 折叠按钮 */}
      <div className="p-2">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="text-muted-foreground hover:bg-muted inline-flex h-8 w-full items-center justify-center gap-1.5 rounded text-xs"
        >
          {collapsed ? (
            <ChevronsRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronsLeft className="h-3.5 w-3.5" />
          )}
          {showLabels && <span>收起侧边栏</span>}
        </button>
      </div>
    </>
  );
}
