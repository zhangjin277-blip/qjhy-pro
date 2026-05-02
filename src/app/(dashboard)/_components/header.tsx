"use client";

import { Menu } from "lucide-react";

interface HeaderProps {
  userName: string;
  userTitle: string | null;
  onOpenMobile: () => void;
}

export function Header({ userName, userTitle, onOpenMobile }: HeaderProps) {
  const initial = userName.slice(0, 1) || "?";
  return (
    <header className="bg-card flex h-14 items-center gap-3 border-b px-4">
      <button
        type="button"
        onClick={onOpenMobile}
        className="text-muted-foreground hover:bg-muted rounded p-1.5 lg:hidden"
        aria-label="打开菜单"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-2 border-l pl-3">
        <div className="from-primary/80 to-primary flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br text-xs text-white">
          {initial}
        </div>
        <div className="hidden leading-tight md:block">
          <div className="text-xs font-medium">{userName}</div>
          <div className="text-muted-foreground text-[11px]">{userTitle ?? "—"}</div>
        </div>
        <form action="/api/auth/sign-out" method="POST" className="ml-2">
          <button type="submit" className="text-muted-foreground hover:text-primary text-xs">
            退出
          </button>
        </form>
      </div>
    </header>
  );
}
