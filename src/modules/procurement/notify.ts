import { env } from "@/lib/env";
import { isNotificationEnabled } from "@/lib/notify/settings";

const PAGE_URL = `${env.NEXT_PUBLIC_APP_URL}/procurement`;

async function send(title: string, content: string) {
  if (!(await isNotificationEnabled("procurement"))) return;
  const webhook = env.PROCUREMENT_DINGTALK_WEBHOOK || env.DINGTALK_BOT_WEBHOOK;
  if (!webhook) {
    console.warn("[procurement] DINGTALK webhook not configured, skip notification");
    return;
  }
  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msgtype: "markdown",
        markdown: {
          title: `【道具采购】${title}`,
          text: `【道具采购】\n\n${content}\n\n[点击查看详情](${PAGE_URL})`,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) console.error("[procurement] notification failed", response.status);
  } catch (error) {
    console.error("[procurement] notification error", error);
  }
}

export function notifyProcurementNew(
  item: { item_name: string; price?: unknown; quantity?: unknown; anchor_name?: string | null },
  submitter: string,
) {
  return send(
    "新采购申请",
    `### 📝 新采购申请\n\n**${submitter}** 提交了采购申请\n\n> 物品：**${item.item_name}**\n> 金额：¥${item.price ?? 0} × ${item.quantity ?? 1}${item.anchor_name ? `\n> 主播：${item.anchor_name}` : ""}`,
  );
}

export function notifyProcurementTransition(
  title: string,
  item: { item_name: string },
  operator: string,
  details: string,
) {
  return send(
    title,
    `### ${title}\n\n**${operator}** 更新了采购记录\n\n> 物品：**${item.item_name}**${details ? `\n${details}` : ""}`,
  );
}
