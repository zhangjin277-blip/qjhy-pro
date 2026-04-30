"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      router.push("/dashboard");
    } catch {
      setError("登录失败");
    } finally {
      setLoading(false);
    }
  }

  function handleDingtalkLogin() {
    setError("钉钉登录将在 Phase 1 启用。请使用应急登录。");
  }

  return (
    <main className="bg-muted/30 flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>QJHY-Pro 登录</CardTitle>
          <CardDescription>使用钉钉扫码或应急账号登录</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleDingtalkLogin} className="w-full">
            钉钉扫码登录（Phase 1 启用）
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
        </CardContent>
      </Card>
    </main>
  );
}
