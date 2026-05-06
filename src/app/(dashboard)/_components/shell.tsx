"use client";

import { useState, type ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

interface ShellProps {
  defaultCollapsed: boolean;
  userName: string;
  userTitle: string | null;
  children: ReactNode;
}

export function DashboardShell({ defaultCollapsed, userName, userTitle, children }: ShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div
      className="relative flex h-screen w-screen overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #e9eff7 0%, #eef3fa 50%, #ecf2fa 100%)",
      }}
    >
      <Sidebar
        defaultCollapsed={defaultCollapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* TopBar 浮在 main card 外面：头像 + 退出 在右上 */}
        <Header
          userName={userName}
          userTitle={userTitle}
          onOpenMobile={() => setMobileOpen(true)}
        />
        {/* Main card 圆角浮卡 — 无内部 header，顶部留白增加 */}
        <main className="relative z-10 mx-2 mb-2 flex flex-1 flex-col overflow-hidden rounded-2xl border border-white/60 bg-white/80 shadow-xl backdrop-blur-xl md:mx-4 md:mb-4 md:rounded-[24px]">
          <div className="flex-1 overflow-y-auto p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
