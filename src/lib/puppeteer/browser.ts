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
 */
export async function openDouyinPage(cookies: Record<string, string>): Promise<Page> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  );
  // 先访问主域名才能 setCookie
  await page.goto("https://union.bytedance.com/", { waitUntil: "domcontentloaded" });
  const cookieEntries = Object.entries(cookies).map(([name, value]) => ({
    name,
    value,
    domain: ".bytedance.com",
    path: "/",
  }));
  await page.setCookie(...cookieEntries);
  return page;
}
