"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MODULE_LABEL, type ModuleKey } from "@/modules/permissions";
import { registerByInvite, previewInviteCodeAction } from "./actions";

interface CodePreview {
  state: "idle" | "loading" | "ok" | "bad";
  remaining?: number;
  modules?: string[];
  note?: string | null;
  reason?: string;
}

function RegisterInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const codeFromUrl = searchParams.get("code") ?? "";

  const [code, setCode] = useState(codeFromUrl);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CodePreview>({ state: "idle" });
  const [pending, startTransition] = useTransition();

  // 邀请码预览（去抖：失焦时校验）
  async function checkCode(value: string) {
    const trimmed = value.trim();
    if (trimmed.length < 6) {
      setPreview({ state: "idle" });
      return;
    }
    setPreview({ state: "loading" });
    const res = await previewInviteCodeAction(trimmed);
    if (res.ok) {
      setPreview({
        state: "ok",
        remaining: res.remaining,
        modules: res.modules,
        note: res.note,
      });
    } else {
      const reasonMap: Record<string, string> = {
        not_found: "邀请码不存在",
        revoked: "邀请码已被撤销",
        expired: "邀请码已过期",
        exhausted: "邀请码已用尽",
      };
      setPreview({ state: "bad", reason: reasonMap[res.reason] ?? res.reason });
    }
  }

  // URL 带 code 时自动校验一次
  useEffect(() => {
    if (codeFromUrl) {
      void checkCode(codeFromUrl);
    }
  }, [codeFromUrl]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await registerByInvite({ code: code.trim(), email, password, name });
      if (res.ok) {
        router.push(res.redirectTo);
      } else {
        if (res.issues && res.issues.length > 0) {
          setError(res.issues.map((i) => `${i.path}: ${i.message}`).join("; "));
        } else {
          setError(res.message);
        }
      }
    });
  }

  return (
    <main className="bg-muted/30 flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>奇迹服务平台·运营版 邀请码注册</CardTitle>
          <CardDescription>使用 admin 提供的邀请码创建外部账号</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="code">邀请码</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onBlur={(e) => checkCode(e.target.value)}
                placeholder="QJHY-XXXXXX"
                required
                autoComplete="off"
                autoFocus={!codeFromUrl}
              />
              {preview.state === "loading" && (
                <p className="text-muted-foreground text-xs">校验中…</p>
              )}
              {preview.state === "ok" && (
                <div className="bg-muted/50 rounded-md px-3 py-2 text-xs">
                  <p className="text-foreground font-medium">
                    ✓ 邀请码可用（剩余 {preview.remaining} 次）
                  </p>
                  {preview.note && (
                    <p className="text-muted-foreground mt-1">说明：{preview.note}</p>
                  )}
                  <p className="text-muted-foreground mt-1">
                    可访问模块：
                    {preview.modules?.map((m) => MODULE_LABEL[m as ModuleKey] ?? m).join(" / ")}
                  </p>
                </div>
              )}
              {preview.state === "bad" && (
                <p className="text-destructive text-xs">{preview.reason}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">姓名</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="您的真实姓名"
                required
                autoComplete="name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 8 位"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}

            <Button
              type="submit"
              disabled={pending || preview.state === "bad" || preview.state === "loading"}
              className="w-full"
            >
              {pending ? "注册中…" : "注册并登录"}
            </Button>
          </form>

          <div className="text-muted-foreground text-center text-xs">
            已有账号？{" "}
            <Link href="/login" className="text-primary hover:underline">
              返回登录
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <RegisterInner />
    </Suspense>
  );
}
