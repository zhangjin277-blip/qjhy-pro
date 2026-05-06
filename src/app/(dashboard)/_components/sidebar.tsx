"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronsLeft, ChevronsRight, Radio, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { NAV, findActiveSectionKey, isHrefActive } from "@/lib/nav";

interface SidebarProps {
  defaultCollapsed: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ defaultCollapsed, mobileOpen, onMobileClose }: SidebarProps) {
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
          collapsed ? "w-16" : "w-[232px]",
        )}
      >
        <SidebarInner
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
            className="bg-card absolute inset-y-0 left-0 flex h-dvh w-[232px] flex-col border-r"
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
  showLabels: boolean;
  openSections: Set<string>;
  toggleSection: (key: string) => void;
  pathname: string;
  collapsed: boolean;
  toggleCollapsed: () => void;
  onItemClick?: () => void;
}

function SidebarInner({
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
      <div className="flex h-14 items-center gap-2.5 px-3">
        <div className="from-primary to-primary/70 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br shadow-sm ring-1 ring-white/30 ring-inset">
          <Radio className="h-[18px] w-[18px] text-white" strokeWidth={2.4} />
        </div>
        {showLabels && (
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold">直播服务平台</span>
            <span className="ring-amber-200/60 inline-flex shrink-0 items-center rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700 ring-1 ring-inset">
              长沙奇迹互娱
            </span>
          </div>
        )}
      </div>

      {/* 导航 */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {NAV.map((sec) => {
          const Icon = sec.icon;

          if (sec.single) {
            const active = isHrefActive(sec.href, pathname);
            return (
              <Link
                key={sec.key}
                href={sec.href}
                onClick={onItemClick}
                className={cn(
                  "flex h-9 items-center gap-2 rounded px-2.5 text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground/80 hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {showLabels && <span>{sec.label}</span>}
              </Link>
            );
          }

          const visibleChildren = sec.children.filter((it) => !it.disabled);
          if (visibleChildren.length === 0) {
            return null;
          }

          const open = openSections.has(sec.key);
          return (
            <div key={sec.key} className="mb-1">
              <button
                type="button"
                onClick={() => showLabels && toggleSection(sec.key)}
                className="text-foreground/80 hover:bg-muted flex h-9 w-full items-center gap-2 rounded px-2.5 text-sm transition-colors"
              >
                <Icon className="h-4 w-4 shrink-0" />
                {showLabels && (
                  <>
                    <span className="flex-1 text-left font-medium">{sec.label}</span>
                    <ChevronDown
                      className={cn(
                        "text-muted-foreground h-3.5 w-3.5 transition-transform",
                        open ? "rotate-0" : "-rotate-90",
                      )}
                    />
                  </>
                )}
              </button>
              {open && showLabels && (
                <div className="border-border/60 mt-0.5 ml-2 grid grid-cols-2 gap-0.5 border-l pl-4">
                  {visibleChildren.map((it) => {
                    const active = isHrefActive(it.href, pathname);
                    return (
                      <Link
                        key={it.key}
                        href={it.href}
                        onClick={onItemClick}
                        className={cn(
                          "truncate rounded px-2 py-1.5 text-left text-xs transition-colors",
                          active
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-sidebar-leaf-foreground hover:bg-muted hover:text-foreground",
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
