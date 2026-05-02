import type { Page } from "puppeteer-core";

/**
 * 在浏览器 context 内调 fetch，让平台前端 SDK 自动加 X-Bogus / _signature 等签名。
 * url 必须含完整 query string；headers 由调用方传（X-Appid: 3000 等）。
 */
export async function pageFetch<T = unknown>(
  page: Page,
  url: string,
  init?: { headers?: Record<string, string>; method?: string; body?: string },
): Promise<T> {
  const result = await page.evaluate(
    async (u, i) => {
      const res = await fetch(u, {
        method: i?.method ?? "GET",
        headers: i?.headers ?? {},
        body: i?.body,
        credentials: "include",
      });
      const text = await res.text();
      return { status: res.status, text };
    },
    url,
    init,
  );

  if (result.status === 401 || result.status === 403) {
    throw new CookieExpiredError(`Auth failed (${result.status}) on ${url}`);
  }
  if (!result.text.startsWith("{")) {
    // 重定向到登录页
    throw new CookieExpiredError(`Non-JSON response on ${url} (likely redirected to login)`);
  }
  return JSON.parse(result.text) as T;
}

export class CookieExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CookieExpiredError";
  }
}
