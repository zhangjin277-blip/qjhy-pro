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
    <div className="bg-muted/20 flex min-h-screen">
      <Sidebar
        defaultCollapsed={defaultCollapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          userName={userName}
          userTitle={userTitle}
          onOpenMobile={() => setMobileOpen(true)}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
