import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page } from "puppeteer-core";

puppeteer.use(StealthPlugin());

let _browser: Browser | null = null;

/**
 * 启动 / 复用 headless Chrome。
 * worker 进程生命周期内只起一个 Browser 实例，省启动开销。
 */
export async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.connected) return _browser;
  _browser = (await puppeteer.launch({
    headless: process.env.PUPPETEER_HEADLESS !== "false",
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, // docker 里指 chromium
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
    ],
  })) as unknown as Browser;
  return _browser;
}

/** 关闭 Browser（仅 worker shutdown 调用） */
export async function closeBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

/**
 * 打开抖音公会平台 page，注入 Cookie。
 * 调用方负责关闭 page。
 *
 * 流程：先 setCookie（不需要先 goto，puppeteer 24+ 支持），再 goto 业务页面让平台前端 SDK 加载，
 * 平台 SDK 会自动 hook fetch 加签名（X-Bogus / msToken / _signature）。
 */
export async function openDouyinPage(cookies: Record<string, string>): Promise<Page> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
  );

  console.log("[puppeteer] setting cookies for", Object.keys(cookies).length, "keys");
  const cookieEntries = Object.entries(cookies).map(([name, value]) => ({
    name,
    value,
    domain: ".bytedance.com",
    path: "/",
  }));
  await page.setCookie(...cookieEntries);

  console.log("[puppeteer] navigating to anchor list page (loads platform SDK)");
  await page.goto("https://union.bytedance.com/open/portal/anchor/list", {
    waitUntil: "networkidle2",
    timeout: 60_000,
  });
  // 等待 SDK 完成 SPA router 二次跳转 + 平台前端 fetch hook 注入完成
  // 不加这段会触发 "Execution context was destroyed, most likely because of a navigation"
  await new Promise((r) => setTimeout(r, 5000));
  console.log("[puppeteer] page ready, url=", page.url());

  return page;
}
