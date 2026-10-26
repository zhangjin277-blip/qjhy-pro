import { env } from "@/lib/env";
import { isAppError } from "@/lib/errors";

/**
 * 剪辑加急通知专用 webhook。
 * 优先用 EDITING_DINGTALK_WEBHOOK，兜底用 DINGTALK_BOT_WEBHOOK。
 */
function editingWebhook(): string {
  return env.EDITING_DINGTALK_WEBHOOK || env.DINGTALK_BOT_WEBHOOK;
}

/**
 * 给钉钉机器人发 markdown 消息（剪辑加急场景）。
 * webhook 读 EDITING_DINGTALK_WEBHOOK ?? DINGTALK_BOT_WEBHOOK。
 */
export async function sendDingtalkMarkdown(
  title: string,
  content: string,
  opts?: { isAtAll?: boolean; atMobiles?: string[] },
): Promise<void> {
  const webhook = editingWebhook();
  if (!webhook) {
    console.warn("[dingtalk] EDITING_DINGTALK_WEBHOOK / DINGTALK_BOT_WEBHOOK not configured, skip");
    return;
  }

  const message = {
    msgtype: "markdown",
    markdown: { title, text: content },
    at: opts,
  };

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error("[dingtalk] send failed:", res.status, await res.text());
    }
  } catch (err) {
    console.error("[dingtalk] send error:", err);
  }
}

/**
 * 给钉钉机器人发文本消息。
 *
 * ⚠️ 机器人配置了关键词"报错"——所有消息会自动加 [报错] 前缀。
 */
export async function notifyDingtalk(payload: {
  title: string;
  detail: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  if (!env.DINGTALK_BOT_WEBHOOK) {
    console.warn("[notify] DINGTALK_BOT_WEBHOOK not configured, skip");
    return;
  }

  const lines: string[] = [
    `【报错】${payload.title}`, // ★ 关键词 "报错" 必带
    `详情：${payload.detail}`,
  ];
  if (payload.context && Object.keys(payload.context).length > 0) {
    lines.push(`上下文：${JSON.stringify(payload.context)}`);
  }
  const content = lines.join("\n");

  try {
    const res = await fetch(env.DINGTALK_BOT_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msgtype: "text", text: { content } }),
    });
    if (!res.ok) {
      console.error("[notify] dingtalk webhook returned", res.status, await res.text());
    }
  } catch (err) {
    console.error("[notify] dingtalk fetch failed:", err);
  }
}

/** 投放整点导入预警，使用独立机器人，关键词必须包含「预警」。 */
export async function notifyPlacementAlert(payload: {
  title: string;
  detail: string;
}): Promise<void> {
  const webhook = env.PLACEMENT_ALERT_DINGTALK_WEBHOOK;
  if (!webhook) {
    console.warn("[notify] PLACEMENT_ALERT_DINGTALK_WEBHOOK not configured, skip");
    return;
  }
  const content = [`【预警】${payload.title}`, payload.detail, "请运营手动补数据。"].join("\n");
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msgtype: "text", text: { content } }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error("[notify] placement alert webhook returned", res.status, await res.text());
    }
  } catch (err) {
    console.error("[notify] placement alert webhook failed:", err);
  }
}

/**
 * Cookie 失效提醒，走专用机器人 COOKIE_ALERT_DINGTALK_WEBHOOK。
 *
 * ⚠️ 该机器人配置了关键词「更新」——消息文本必须含「更新」否则钉钉拒收。
 * 触发：抖音/快手 cookie 被标记 expired（active→expired 转换）时。
 */
export async function notifyCookieExpired(opts: {
  platform: string; // 抖音 / 快手
  basecamp: string; // cs / nc1 / nc2 / kuaishou
}): Promise<void> {
  const webhook = env.COOKIE_ALERT_DINGTALK_WEBHOOK;
  if (!webhook) {
    console.warn("[notify] COOKIE_ALERT_DINGTALK_WEBHOOK not configured, skip");
    return;
  }
  const now = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  const content = [
    `【Cookie 更新提醒】`, // ★ 关键词「更新」必带
    `平台：${opts.platform}（${opts.basecamp}）`,
    `状态：Cookie 已失效，相关采集已暂停`,
    `请尽快重新扫码更新 Cookie。`,
    `时间：${now}`,
  ].join("\n");

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msgtype: "text", text: { content } }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error("[notify] cookie-alert webhook returned", res.status, await res.text());
    }
  } catch (err) {
    console.error("[notify] cookie-alert fetch failed:", err);
  }
}

/**
 * 把任意错误转成钉钉通知。
 */
export async function notifyError(err: unknown, context?: Record<string, unknown>): Promise<void> {
  if (isAppError(err)) {
    await notifyDingtalk({
      title: err.code,
      detail: err.message,
      context: { ...err.context, ...context },
    });
  } else if (err instanceof Error) {
    await notifyDingtalk({
      title: "UNHANDLED_ERROR",
      detail: err.message,
      context: { stack: err.stack?.slice(0, 500), ...context },
    });
  } else {
    await notifyDingtalk({
      title: "UNKNOWN_ERROR",
      detail: String(err),
      context,
    });
  }
}
