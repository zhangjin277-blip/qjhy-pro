import type { Page } from "puppeteer-core";

/**
 * 在浏览器 context 内调 fetch，让平台前端 SDK 自动加 X-Bogus / _signature 等签名。
 * url 必须含完整 query string；headers 由调用方传（X-Appid: 3000 等）。
 */
export async function pageFetch<T = unknown>(
  page: Page,
  url: string,
  init?: {
    headers?: Record<string, string>;
    method?: string;
    body?: string;
    preserveLargeIntegers?: boolean;
  },
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
  return (
    init?.preserveLargeIntegers
      ? parseJsonPreservingLargeIntegers(result.text)
      : JSON.parse(result.text)
  ) as T;
}

function parseJsonPreservingLargeIntegers(text: string): unknown {
  let normalized = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? "";
    if (inString) {
      normalized += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      normalized += char;
      continue;
    }
    if (char === "-" || (char >= "0" && char <= "9")) {
      let end = index + 1;
      while (end < text.length && /[0-9.eE+-]/.test(text[end] ?? "")) end += 1;
      const token = text.slice(index, end);
      if (/^-?\d{16,}$/.test(token)) normalized += `"${token}"`;
      else normalized += token;
      index = end - 1;
      continue;
    }
    normalized += char;
  }
  return JSON.parse(normalized);
}

export class CookieExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CookieExpiredError";
  }
}
