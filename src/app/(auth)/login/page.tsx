"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/auth-client";

// 设计 token（取自 Claude Design 「天蓝·浅色」主题）
const C = {
  bg: "#f4f8fc",
  ink: "#0b2545",
  sub: "rgba(11,37,69,.58)",
  line: "rgba(11,37,69,.10)",
  soft: "rgba(17,17,17,.035)",
  accent: "#1e88f0",
  cardShadow:
    "0 1px 0 rgba(255,255,255,.9) inset, 0 30px 60px -30px rgba(11,37,69,.18), 0 8px 24px -8px rgba(30,136,240,.08)",
} as const;

function HelpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="#111" strokeOpacity=".4" />
      <path
        d="M6.4 6.2c.1-.9.9-1.6 1.9-1.5.8 0 1.5.6 1.5 1.3 0 .7-.5 1-1.1 1.4-.5.3-.7.6-.7 1.1"
        stroke="#111"
        strokeOpacity=".5"
        strokeLinecap="round"
      />
      <circle cx="8" cy="11" r=".7" fill="#111" fillOpacity=".5" />
    </svg>
  );
}

function DingIcon({ size = 16 }: { size?: number }) {
  return (
    <Image
      src="/dingtalk.png"
      alt="DingTalk"
      width={size}
      height={size}
      unoptimized
      style={{ display: "block" }}
    />
  );
}

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="#111" strokeWidth="1.6" />
      <path d="m4 7 8 6 8-6" stroke="#111" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      style={{ color: "rgba(17,17,17,.4)" }}
    >
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawNext = searchParams.get("next");
  const next =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  const [tab, setTab] = useState<"email" | "ding">("ding");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [dingtalkLoading, setDingtalkLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const autoTriggered = useRef(false);

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        setError("邮箱或密码不正确");
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
      const result = await authClient.signIn.oauth2({
        providerId: "dingtalk",
        callbackURL: next,
        errorCallbackURL: rawNext ? `/login?next=${encodeURIComponent(rawNext)}` : "/login",
      });
      if (result?.error) {
        setError(`钉钉登录失败：${result.error.message ?? "未知错误"}`);
      }
    } catch (err) {
      setError(`钉钉登录失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setDingtalkLoading(false);
    }
  }

  // 钉钉扫码进 /checkin 场景：URL 带 next 时自动触发钉钉 OAuth
  useEffect(() => {
    if (rawNext && !autoTriggered.current) {
      autoTriggered.current = true;
      setTab("ding");
      void handleDingtalkLogin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawNext]);

  const inputBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    height: 46,
    padding: "0 14px",
    background: C.soft,
    borderRadius: 10,
    transition: "border-color .15s ease",
  };

  return (
    <main
      style={{
        position: "relative",
        minHeight: "100vh",
        background: C.bg,
        color: C.ink,
        fontFamily:
          '"PingFang SC", -apple-system, "Helvetica Neue", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif',
        overflow: "hidden",
      }}
    >
      {/* 左上角 brand mark */}
      <div
        style={{
          position: "absolute",
          left: 40,
          top: 28,
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          aria-hidden
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #1677ff, #4096ff)",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,.3), 0 1px 2px rgba(0,0,0,.04)",
            flexShrink: 0,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#fff">
            <rect x="4" y="5.5" width="16" height="4.2" rx="2.1" />
            <rect x="9.9" y="6" width="4.2" height="13" rx="2.1" />
          </svg>
        </div>
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: ".02em",
            color: C.ink,
          }}
        >
          奇迹服务平台·运营版
        </span>
      </div>

      {/* 左上角光晕 */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: "radial-gradient(55% 45% at 12% 18%, rgba(56,189,248,.16), transparent 70%)",
        }}
      />

      {/* 左下大「奇」字背纹 */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "-60px",
          bottom: "-120px",
          fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", serif',
          fontSize: 720,
          fontWeight: 700,
          lineHeight: 1,
          color: "rgba(30,136,240,.07)",
          letterSpacing: "-0.04em",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        奇
      </div>

      {/* 主体网格 */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          minHeight: "100vh",
          padding: "0 280px 0 96px",
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          gap: 80,
        }}
        className="login-grid"
      >
        {/* 左：品牌 */}
        <div style={{ maxWidth: 640 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 11px 5px 8px",
              borderRadius: 999,
              background: "rgba(17,17,17,.04)",
              border: `1px solid ${C.line}`,
              fontSize: 12,
              color: C.sub,
              letterSpacing: ".04em",
              marginBottom: 28,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                background: "#2bb673",
              }}
            />
            v0.4 · phase 2.2 上线 投放迁移 & 排班 override
          </div>

          <h1
            style={{
              fontSize: 68,
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: ".01em",
              margin: 0,
              color: "#000",
              whiteSpace: "nowrap",
            }}
            className="login-hero"
          >
            途游游戏
            <span style={{ color: C.sub, fontWeight: 600, margin: "0 .12em" }}>·</span>
            奇迹互娱
          </h1>

          <p
            style={{
              marginTop: 22,
              fontSize: 18,
              lineHeight: 1.55,
              color: C.sub,
              maxWidth: 460,
              letterSpacing: ".02em",
            }}
          >
            一个工作台 · 连接所有业务
          </p>
        </div>

        {/* 右：登录卡 */}
        <div
          style={{
            width: 420,
            background: "#fff",
            borderRadius: 16,
            padding: "36px 36px 32px",
            boxShadow: C.cardShadow,
            color: C.ink,
          }}
          className="login-card"
        >
          {/* 标题 */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 26 }}>
            <h2
              style={{
                fontSize: 19,
                fontWeight: 600,
                letterSpacing: ".01em",
                margin: 0,
                color: "#111",
              }}
            >
              登录奇迹互娱中台
            </h2>
            <HelpIcon />
          </div>

          {/* Tabs */}
          <div
            style={{
              display: "flex",
              gap: 28,
              marginBottom: 22,
              borderBottom: "1px solid rgba(17,17,17,.08)",
            }}
          >
            {(
              [
                ["ding", "钉钉登录"],
                ["email", "邮箱登录"],
              ] as const
            ).map(([k, label]) => {
              const active = tab === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  style={{
                    appearance: "none",
                    background: "transparent",
                    border: 0,
                    padding: "0 0 12px",
                    fontSize: 14,
                    fontWeight: active ? 600 : 500,
                    color: active ? "#111" : "rgba(17,17,17,.45)",
                    cursor: "pointer",
                    position: "relative",
                    fontFamily: "inherit",
                  }}
                >
                  {label}
                  {active && (
                    <span
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: -1,
                        height: 2,
                        background: C.accent,
                        borderRadius: 2,
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Email tab */}
          {tab === "email" && (
            <form
              onSubmit={handleEmailLogin}
              style={{ display: "flex", flexDirection: "column", gap: 16 }}
            >
              <label style={{ display: "block" }}>
                <div
                  style={{ fontSize: 12, color: C.sub, marginBottom: 8, letterSpacing: ".02em" }}
                >
                  邮箱
                </div>
                <div
                  style={{
                    ...inputBase,
                    border: `1px solid ${focused === "email" ? C.accent : C.line}`,
                  }}
                >
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setFocused("email")}
                    onBlur={() => setFocused(null)}
                    placeholder="name@qiji.com"
                    autoComplete="email"
                    required
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: 0,
                      outline: 0,
                      fontSize: 14,
                      color: "#111",
                      fontFamily: "inherit",
                      letterSpacing: ".01em",
                    }}
                  />
                </div>
              </label>

              <label style={{ display: "block" }}>
                <div
                  style={{ fontSize: 12, color: C.sub, marginBottom: 8, letterSpacing: ".02em" }}
                >
                  密码
                </div>
                <div
                  style={{
                    ...inputBase,
                    border: `1px solid ${focused === "password" ? C.accent : C.line}`,
                  }}
                >
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocused("password")}
                    onBlur={() => setFocused(null)}
                    placeholder="请输入密码"
                    autoComplete="current-password"
                    required
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: 0,
                      outline: 0,
                      fontSize: 14,
                      color: "#111",
                      fontFamily: "inherit",
                      letterSpacing: ".01em",
                    }}
                  />
                  <span style={{ marginLeft: 8 }}>
                    <EyeIcon />
                  </span>
                </div>
              </label>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: -2,
                  fontSize: 13,
                  color: C.sub,
                }}
              >
                <span style={{ color: "rgba(17,17,17,.4)" }}>外部账号？登录后会自动跳转</span>
                <a
                  href="/register"
                  style={{
                    fontSize: 13,
                    color: C.accent,
                    textDecoration: "none",
                    letterSpacing: ".01em",
                  }}
                >
                  申请邀请码 →
                </a>
              </div>

              {error && (
                <div
                  style={{
                    borderRadius: 6,
                    border: "1px solid rgba(220,38,38,.2)",
                    background: "rgba(254,242,242,.8)",
                    padding: "8px 10px",
                    fontSize: 12.5,
                    color: "#b91c1c",
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: 4,
                  appearance: "none",
                  border: 0,
                  height: 46,
                  borderRadius: 10,
                  background: C.accent,
                  color: "#fff",
                  fontSize: 14.5,
                  fontWeight: 600,
                  letterSpacing: ".08em",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "登 录 中..." : "登 录"}
              </button>

              <div style={{ textAlign: "center", fontSize: 12.5, color: "rgba(17,17,17,.5)" }}>
                没有账号？请联系 IT
                <a
                  href="/register"
                  style={{ color: C.accent, marginLeft: 4, textDecoration: "none" }}
                >
                  申请开通 →
                </a>
              </div>
            </form>
          )}

          {/* Ding tab */}
          {tab === "ding" && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "8px 0 4px",
              }}
            >
              <DingIcon size={96} />

              <button
                type="button"
                onClick={handleDingtalkLogin}
                disabled={dingtalkLoading}
                style={{
                  marginTop: 18,
                  appearance: "none",
                  border: 0,
                  height: 42,
                  width: 240,
                  borderRadius: 10,
                  background: C.accent,
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: ".05em",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  opacity: dingtalkLoading ? 0.7 : 1,
                }}
              >
                {dingtalkLoading ? "正在跳转钉钉..." : "钉钉一键登录"}
              </button>

              <div
                style={{
                  marginTop: 12,
                  fontSize: 12.5,
                  color: "rgba(17,17,17,.5)",
                  textAlign: "center",
                }}
              >
                桌面钉钉已登录时一键确认即可
              </div>

              {error && (
                <div
                  style={{
                    marginTop: 14,
                    borderRadius: 6,
                    border: "1px solid rgba(220,38,38,.2)",
                    background: "rgba(254,242,242,.8)",
                    padding: "8px 10px",
                    fontSize: 12.5,
                    color: "#b91c1c",
                    width: "100%",
                    textAlign: "center",
                  }}
                >
                  {error}
                </div>
              )}
            </div>
          )}

          {/* 其他方式 footer */}
          <div style={{ marginTop: 26, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ flex: 1, height: 1, background: "rgba(17,17,17,.08)" }} />
            <div style={{ fontSize: 12, color: "rgba(17,17,17,.4)" }}>其他登录方式</div>
            <div style={{ flex: 1, height: 1, background: "rgba(17,17,17,.08)" }} />
          </div>
          <div style={{ marginTop: 16, display: "flex", justifyContent: "center", gap: 10 }}>
            <button
              type="button"
              onClick={() => setTab(tab === "email" ? "ding" : "email")}
              title={tab === "email" ? "钉钉登录" : "邮箱登录"}
              style={{
                appearance: "none",
                border: "1px solid rgba(17,17,17,.10)",
                background: "#fff",
                width: 40,
                height: 40,
                borderRadius: 10,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              {tab === "email" ? <DingIcon /> : <MailIcon />}
            </button>
          </div>
        </div>
      </div>

      {/* 底部 wordmark */}
      <footer
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 22,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 14,
          fontSize: 11,
          color: C.sub,
          letterSpacing: ".42em",
        }}
      >
        <span style={{ width: 28, height: 1, background: C.line }} />
        TUYOO GAMES · QIJI INTERACTIVE
        <span style={{ width: 28, height: 1, background: C.line }} />
      </footer>

      <style>{`
        @media (max-width: 900px) {
          .login-grid {
            padding: 40px 24px !important;
            grid-template-columns: 1fr !important;
            gap: 32px !important;
          }
          .login-hero {
            font-size: 36px !important;
            white-space: normal !important;
          }
          .login-card {
            width: 100% !important;
            max-width: 420px;
            justify-self: center;
          }
        }
      `}</style>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh" }} />}>
      <LoginInner />
    </Suspense>
  );
}
