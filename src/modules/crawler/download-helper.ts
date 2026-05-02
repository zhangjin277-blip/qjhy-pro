import "server-only";
import type { Page } from "puppeteer-core";
import { pageFetch } from "@/lib/puppeteer";

const BASE = "https://union.bytedance.com";

/**
 * 抖音公会平台导出（download）API 模式：
 *   1. 触发: GET <endpoint>?<params>&filename=xxx → 返回 task_id
 *   2. 轮询: 调消息中心 fetch_msg_list 找 filename 匹配 + wass_url 非空的 task
 *   3. 下载: GET wass_url → 拿到 CSV 文本
 *   4. 解析: 中文表头的 CSV → 行对象数组
 */

export interface DownloadTask {
  /** API 路径，例: '/ark/api/data/pugna_component/download/v2/union/data_center/anchor_list' */
  endpoint: string;
  /** 触发参数（fields 是数组会展开成多个 ?fields=a&fields=b） */
  params: Record<string, string | number | string[]>;
  /** 在消息中心匹配 filename startsWith 这个值 */
  filename: string;
}

/** 触发导出 → 返回 task_id（失败抛错） */
export async function triggerDownload(page: Page, task: DownloadTask): Promise<string> {
  const qs = buildQueryString(task.params);
  const url = `${BASE}${task.endpoint}?${qs}&filename=${encodeURIComponent(task.filename)}`;
  const headers = {
    "x-appid": "3000",
    "x-appid-gray": "1",
    "x-language": "zh",
  };
  interface TriggerResp {
    status_code: number;
    data?: { task_id?: string };
  }
  const res = await pageFetch<TriggerResp>(page, url, { headers });
  if (res.status_code !== 0 || !res.data?.task_id) {
    throw new Error(`触发导出失败 ${task.filename}: status=${res.status_code}`);
  }
  return res.data.task_id;
}

/**
 * 轮询消息中心拿 wass_url。max 60 次 × 5s = 5 分钟。
 * 只匹配 trigger 时间之后的消息（避免历史 task 干扰）。
 */
export async function pollForDownloadUrl(
  page: Page,
  filename: string,
  triggerTimestamp: number,
  opts: { maxAttempts?: number; intervalMs?: number } = {},
): Promise<string> {
  const maxAttempts = opts.maxAttempts ?? 60;
  const intervalMs = opts.intervalMs ?? 5_000;

  interface FetchMsgResp {
    status_code: number;
    data?: {
      list?: { content?: string | object; create_time?: number }[];
      version?: string;
    };
  }
  interface FetchRedDotResp {
    data?: { version?: string };
  }

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(intervalMs);
    let revision = "";
    try {
      const dotRes = await pageFetch<FetchRedDotResp>(
        page,
        `${BASE}/ark/api/tools/msg/v2/fetch_red_dot`,
      );
      revision = dotRes.data?.version ?? "";
    } catch {
      // ignore
    }

    const msgUrl =
      `${BASE}/ark/api/tools/msg/v2/fetch_msg_list?page=1&size=200` +
      (revision ? `&revision=${revision}` : "");
    let msgRes: FetchMsgResp;
    try {
      msgRes = await pageFetch<FetchMsgResp>(page, msgUrl);
    } catch {
      continue;
    }
    const list = msgRes.data?.list ?? [];

    for (const msg of list) {
      const c =
        typeof msg.content === "string"
          ? safeParseJson(msg.content)
          : (msg.content as Record<string, unknown> | null);
      if (!c) continue;
      const status = c.status;
      const ok = status === true || status === "success" || status === 1;
      const dUrl = (c.wass_url as string) || (c.download_url as string) || "";
      const fn = (c.filename as string) || "";
      if (!ok || !dUrl) continue;
      if (!fn.startsWith(filename)) continue;
      const rest = fn.substring(filename.length);
      // filename 完全匹配，或者带数字时间戳后缀
      if (rest && !/^\d/.test(rest)) continue;
      const msgTime = msg.create_time ?? 0;
      if (msgTime < triggerTimestamp) continue;
      return dUrl.startsWith("http") ? dUrl : `${BASE}${dUrl}`;
    }
  }
  throw new Error(`等待导出超时（${(maxAttempts * intervalMs) / 1000}s）: ${filename}`);
}

/** 下载 CSV 文本 */
export async function downloadCsv(page: Page, url: string): Promise<string> {
  const text = await page.evaluate(async (u) => {
    const r = await fetch(u, { credentials: "include" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  }, url);
  return text;
}

/**
 * 解析中文表头的 CSV → 数组每行是 { 中文表头: 字符串值 }。
 * 处理 BOM、引号转义、CRLF。
 */
export function parseCsv(content: string): Record<string, string>[] {
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

  // 用 split 简化（不处理引号内换行的极端情况，导出 CSV 平台一般不会有）
  const rawLines = content.split(/\r\n|\r|\n/).filter((l) => l.trim() !== "");
  if (rawLines.length < 2) return [];

  const splitCsvLine = (line: string): string[] => {
    const cells: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (ch === "," && !inQuote) {
        cells.push(cur);
        cur = "";
      } else {
        cur += ch ?? "";
      }
    }
    cells.push(cur);
    return cells;
  };

  const headerLine = rawLines[0];
  if (!headerLine) return [];
  const headers = splitCsvLine(headerLine).map((h) => h.trim());

  const out: Record<string, string>[] = [];
  for (let i = 1; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (!line) continue;
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const k = headers[j];
      if (!k) continue;
      row[k] = (cells[j] ?? "").trim();
    }
    out.push(row);
  }
  return out;
}

/**
 * 一次完成 触发 + 轮询 + 下载 + 解析
 */
export async function runExport(page: Page, task: DownloadTask): Promise<Record<string, string>[]> {
  const triggerTime = Math.floor(Date.now() / 1000) - 5;
  console.log(`[download] 触发导出: ${task.filename}`);
  await triggerDownload(page, task);
  console.log(`[download] 等待 wass_url: ${task.filename}`);
  const url = await pollForDownloadUrl(page, task.filename, triggerTime);
  console.log(`[download] 下载 CSV: ${task.filename}`);
  const csv = await downloadCsv(page, url);
  const rows = parseCsv(csv);
  console.log(`[download] 解析 ${rows.length} 行 (${task.filename})`);
  return rows;
}

function buildQueryString(params: Record<string, string | number | string[]>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const x of v) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(x)}`);
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.join("&");
}

/**
 * 轻量数据就绪检测：调 anchor_summary 同步 endpoint，看 totalFanTicket。
 * 这个 endpoint 同步返回，开销小（不像 download 要 5 分钟）。
 */
export async function checkDataReady(
  page: Page,
  date: string,
): Promise<{ ready: boolean; detail: string }> {
  const url =
    `${BASE}/ark/api/data/pugna_component/data/v2/union/data_center/anchor_summary` +
    `?beginDate=${date}&endDate=${date}&fields=totalFanTicket`;
  interface Resp {
    status_code: number;
    data?: { data_string?: string };
  }
  let res: Resp;
  try {
    res = await pageFetch<Resp>(page, url, { headers: { "x-appid": "3000" } });
  } catch (e) {
    return { ready: false, detail: `fetch error: ${(e as Error).message}` };
  }
  if (res.status_code !== 0 || !res.data?.data_string) {
    return { ready: false, detail: `status_code=${res.status_code}` };
  }
  const inner = safeParseJson(res.data.data_string);
  const series =
    (inner?.data as { series?: { totalFanTicket?: string }[] } | undefined)?.series ?? [];
  if (series.length === 0) return { ready: false, detail: "series 为空" };
  const first = series[0];
  const total = parseInt(first?.totalFanTicket ?? "0", 10);
  return { ready: total > 0, detail: `totalFanTicket=${total}` };
}

function safeParseJson(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
