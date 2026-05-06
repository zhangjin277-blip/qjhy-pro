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
        background:
          "linear-gradient(180deg, var(--bg-page-start) 0%, var(--bg-page-mid) 48%, var(--bg-page-end) 100%)",
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
        {/* Main card 圆角浮卡 — 滚动条在浮卡外侧 */}
        <main className="workspace-scroll relative z-10 mx-2 mb-2 min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pr-3 md:mr-2 md:mb-4 md:ml-0 md:pr-3">
          <div className="workspace-shell min-h-full min-w-0 rounded-2xl md:rounded-[28px]">
            <div className="min-w-0 p-3 md:px-4 md:py-4">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
