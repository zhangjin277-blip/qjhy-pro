/**
 * 测试 /rest/analysis/live/room/today/list 接口在 puppeteer 内是否能直接调通。
 * 关键：URL 带 __NS_hxfalcon（反爬 token），需要确认浏览器 SDK 自动注入。
 *
 * pnpm tsx --env-file=.env.local scripts/test-kuaishou-today-list.ts
 */
import "dotenv/config";
import { openKuaishouPage, closeBrowser } from "../src/lib/puppeteer";
import { getActiveCookies } from "../src/modules/crawler/server";

async function main(): Promise<void> {
  const cookies = await getActiveCookies("kuaishou");
  const page = await openKuaishouPage(cookies);

  try {
    const reqBody = JSON.stringify({
      memberIds: [],
      brokerId: "",
      liveTitle: "",
      orderBy: "totalOnlineNum",
      order: "descending",
      page: 1,
      count: 20,
    });

    console.log("[test] calling /rest/analysis/live/room/today/list ...");
    const { status, text } = await page.evaluate(async (body: string) => {
      const res = await fetch("/rest/analysis/live/room/today/list", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "application/json" },
        body,
      });
      return { status: res.status, text: await res.text() };
    }, reqBody);

    console.log(`[test] status=${status}`);
    if (!text.startsWith("{")) {
      console.log(`[test] non-JSON response (first 300 chars):\n${text.slice(0, 300)}`);
      return;
    }
    const json = JSON.parse(text);
    console.log(`[test] result=${json.result} total=${json.data?.total ?? "?"}`);
    if (json.data?.list?.length) {
      const first = json.data.list[0];
      console.log("[test] first row keys:", Object.keys(first));
      console.log("[test] first row sample:", {
        memberName: first.memberName,
        broker: first.brokerName,
        liveId: first.liveId,
        startTime: new Date(first.startTime).toISOString(),
        acu: first.acu,
        avgOnlineDuration: first.avgOnlineDuration,
        liveAmt: first.liveAmt,
      });
    } else {
      console.log("[test] response.data:", JSON.stringify(json).slice(0, 500));
    }
  } finally {
    await page.close();
    await closeBrowser().catch((err) => {
      console.warn("[close-browser] failed:", err);
    });
    process.exit(0);
  }
}

void main();
