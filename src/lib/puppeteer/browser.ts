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

/**
 * 打开快手机构后台 page，注入 Cookie。
 * cookie domain `.kuaishou.com`；goto 成员管理列表页加载快手前端 SDK（自动给后续 fetch 加 sig3 签名）。
 */
export async function openKuaishouPage(cookies: Record<string, string>): Promise<Page> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
  );

  console.log("[puppeteer/kuaishou] setting cookies for", Object.keys(cookies).length, "keys");
  const cookieEntries = Object.entries(cookies).map(([name, value]) => ({
    name,
    value,
    domain: ".kuaishou.com",
    path: "/",
  }));
  await page.setCookie(...cookieEntries);

  console.log("[puppeteer/kuaishou] navigating to member list page");
  await page.goto("https://jigou.kuaishou.com/operation/member/list_v2/list", {
    waitUntil: "networkidle2",
    timeout: 60_000,
  });
  // 同抖音：等 SPA router + 前端签名 SDK 注入
  await new Promise((r) => setTimeout(r, 5000));
  console.log("[puppeteer/kuaishou] page ready, url=", page.url());

  return page;
}

/** 打开快手创作者后台，供作品分析/数据中心采集使用。 */
export async function openKuaishouCreatorPage(cookies: Record<string, string>): Promise<Page> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
  );
  const cookieEntries = Object.entries(cookies).map(([name, value]) => ({
    name,
    value,
    domain: ".kuaishou.com",
    path: "/",
  }));
  await page.setCookie(...cookieEntries);
  console.log("[puppeteer/kuaishou-creator] navigating to works page");
  await page.goto("https://cp.kuaishou.com/statistics/works", {
    waitUntil: "networkidle2",
    timeout: 60_000,
  });
  await new Promise((resolve) => setTimeout(resolve, 5000));
  if (!page.url().includes("cp.kuaishou.com")) {
    throw new Error(`Kuaishou creator login unavailable, redirected to ${page.url()}`);
  }
  console.log("[puppeteer/kuaishou-creator] page ready, url=", page.url());
  return page;
}

/** 打开视频号创作者后台，供 AI 漫剧作品统计采集使用。 */
export async function openWechatCreatorPage(cookies: Record<string, string>): Promise<Page> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/147.0.0.0 Safari/537.36",
  );
  const headers: Record<string, string> = {};
  if (cookies._wechat_uin) headers["X-WECHAT-UIN"] = cookies._wechat_uin;
  if (cookies._finger_print_device_id)
    headers["finger-print-device-id"] = cookies._finger_print_device_id;
  if (Object.keys(headers).length > 0) await page.setExtraHTTPHeaders(headers);
  await page.setCookie(
    ...Object.entries(cookies)
      .filter(([name]) => !name.startsWith("ls_") && !name.startsWith("_finger_"))
      .map(([name, value]) => ({
        name,
        value,
        domain: "channels.weixin.qq.com",
        path: "/",
      })),
  );
  const localState = Object.entries(cookies)
    .filter(([name]) => name.startsWith("ls_"))
    .map(([name, value]) => [name.slice(3), value] as const);
  if (localState.length > 0) {
    await page.goto("https://channels.weixin.qq.com/empty.html", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.evaluate((entries) => {
      for (const [name, value] of entries) window.localStorage.setItem(name, value);
    }, localState);
  }
  await page.goto("https://channels.weixin.qq.com/platform/statistic/post", {
    waitUntil: "networkidle2",
    timeout: 60_000,
  });
  await new Promise((resolve) => setTimeout(resolve, 5000));
  if (!page.url().includes("channels.weixin.qq.com/platform/statistic"))
    throw new Error(`Wechat creator login unavailable, redirected to ${page.url()}`);
  return page;
}

/** 打开抖音灵机主播后台，供官号下播复盘采集使用。 */
export async function openLingjiPage(cookies: Record<string, string>): Promise<Page> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
  );

  console.log("[puppeteer/lingji] setting cookies for", Object.keys(cookies).length, "keys");
  await page.setCookie(
    ...Object.entries(cookies).map(([name, value]) => ({
      name,
      value,
      domain: ".douyin.com",
      path: "/",
    })),
  );

  await page.goto("https://anchor.douyin.com/anchor/review", {
    waitUntil: "networkidle2",
    timeout: 90_000,
  });
  await new Promise((resolve) => setTimeout(resolve, 6000));
  if (!page.url().includes("/anchor/review")) {
    throw new Error(`Lingji login unavailable, redirected to ${page.url()}`);
  }
  return page;
}

/** 打开抖音创作者中心，供官号视频与数据中心采集使用。 */
export async function openDouyinCreatorPage(cookies: Record<string, string>): Promise<Page> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
  );
  await page.setCookie(
    ...Object.entries(cookies).map(([name, value]) => ({
      name,
      value,
      domain: ".douyin.com",
      path: "/",
    })),
  );
  await page.goto("https://creator.douyin.com/creator-micro/data-center/operation", {
    waitUntil: "networkidle2",
    timeout: 90_000,
  });
  await new Promise((resolve) => setTimeout(resolve, 5000));
  if (!page.url().includes("creator.douyin.com/creator-micro")) {
    throw new Error(`Douyin creator login unavailable, redirected to ${page.url()}`);
  }
  return page;
}
