"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/auth-client";

interface HeaderProps {
  userName: string;
  userTitle: string | null;
  onOpenMobile: () => void;
}

export function Header({ userName, userTitle, onOpenMobile }: HeaderProps) {
  const initial = userName.slice(0, 1) || "?";
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      // 不管 signOut 是否成功（cookie 可能已被 better-auth 清掉），都跳登录页
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <header className="flex h-14 items-center gap-3 bg-transparent px-4">
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
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="text-muted-foreground hover:text-primary ml-2 text-xs disabled:opacity-50"
        >
          {signingOut ? "退出中…" : "退出"}
        </button>
      </div>
    </header>
  );
}
