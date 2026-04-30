import { env } from "@/lib/env";
import { isAppError } from "@/lib/errors";

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
