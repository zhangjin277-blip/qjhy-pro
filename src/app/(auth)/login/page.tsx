"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/auth/auth-client";

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // next 必须以 / 开头（白名单 — 防 open redirect 攻击）
  const rawNext = searchParams.get("next");
  const next =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [dingtalkLoading, setDingtalkLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoTriggered = useRef(false);

  async function handleEmergencyLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "emergency@qjhy.local",
          password,
        }),
      });
      if (!res.ok) {
        setError("应急密码错误");
        return;
      }
      router.push(next);
    } catch {
      setError("登录失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleDingtalkLogin() {
    setDingtalkLoading(true);
    setError(null);
    try {
      // genericOAuthClient 暴露 signIn.oauth2，会重定向到钉钉统一授权页。
      // 钉钉授权后回调到 /api/auth/oauth2/callback/dingtalk，better-auth 处理后跳到 callbackURL。
      const result = await authClient.signIn.oauth2({
        providerId: "dingtalk",
        callbackURL: next,
        errorCallbackURL: rawNext ? `/login?next=${encodeURIComponent(rawNext)}` : "/login",
      });
      // 正常情况下浏览器已被重定向，到这里说明返回了 url 但未自动跳。
      if (result?.error) {
        setError(`钉钉登录失败：${result.error.message ?? "未知错误"}`);
      }
    } catch (err) {
      setError(`钉钉登录失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setDingtalkLoading(false);
    }
  }

  // 钉钉扫码进 /checkin 场景：URL 带 next 参数，自动触发钉钉 OAuth，免手动点
  useEffect(() => {
    if (rawNext && !autoTriggered.current) {
      autoTriggered.current = true;
      void handleDingtalkLogin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawNext]);

  return (
    <main className="bg-muted/30 flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>QJHY-Pro 登录</CardTitle>
          <CardDescription>使用钉钉或应急账号登录</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleDingtalkLogin} disabled={dingtalkLoading} className="w-full">
            {dingtalkLoading ? "正在跳转钉钉..." : "钉钉登录"}
          </Button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card text-muted-foreground px-2">应急通道</span>
            </div>
          </div>

          <form onSubmit={handleEmergencyLogin} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="emergency-password">应急密码</Label>
              <Input
                id="emergency-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="EMERGENCY_LOGIN_PASSWORD"
                required
              />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button type="submit" disabled={loading} variant="outline" className="w-full">
              {loading ? "登录中..." : "应急登录"}
            </Button>
          </form>

          <p className="text-muted-foreground text-center text-xs">
            应急登录会触发钉钉机器人通知。
          </p>

          <p className="text-muted-foreground text-center text-xs">
            外部合作伙伴？
            <a href="/register" className="text-primary ml-1 hover:underline">
              使用邀请码注册
            </a>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <LoginInner />
    </Suspense>
  );
}
