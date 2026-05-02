/**
 * 抖音公会平台返回的字段值预处理。
 * 平台大量字段是格式化字符串（"6小时6分钟38秒" / "17小时前" / "3.8万" / "0%"），
 * 入库前必须反向解析为数值/时间戳。
 */

/**
 * 把"X小时Y分钟Z秒"解析为小时（小数）。
 * "" / null / 无法解析 → null
 */
export function parseDuration(input: string | null | undefined): number | null {
  if (!input || typeof input !== "string") return null;
  const re = /^(?:(\d+)\s*小时)?\s*(?:(\d+)\s*分钟)?\s*(?:(\d+)\s*秒)?$/;
  const m = input.trim().match(re);
  if (!m) return null;
  const [, h, mm, s] = m;
  if (!h && !mm && !s) return null;
  const hours = parseInt(h ?? "0", 10);
  const mins = parseInt(mm ?? "0", 10);
  const secs = parseInt(s ?? "0", 10);
  return Math.round(((hours * 3600 + mins * 60 + secs) / 3600) * 100) / 100;
}

/**
 * 把"17小时前"/"3天前"/"5分钟前"解析为 unix 时间戳（秒）。
 * 基于 now 反推。
 */
export function parseRelativeTime(
  input: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!input || typeof input !== "string") return null;
  const m = input.trim().match(/^(\d+)\s*(秒|分钟|小时|天)前$/);
  if (!m || !m[1] || !m[2]) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const seconds =
    unit === "秒" ? n : unit === "分钟" ? n * 60 : unit === "小时" ? n * 3600 : n * 86400;
  return Math.floor(now.getTime() / 1000) - seconds;
}

/**
 * 把"50%"解析为 0.5（0-1 小数）。
 */
export function parsePercent(input: string | null | undefined): number | null {
  if (!input || typeof input !== "string") return null;
  const m = input.trim().match(/^(-?\d+(?:\.\d+)?)\s*%$/);
  if (!m || !m[1]) return null;
  return parseFloat(m[1]) / 100;
}

/**
 * 把"3.8万"解析为 38000，"1.2亿"解析为 120000000，纯数字字符串原样转 Number。
 */
export function parseChineseNumber(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined || input === "") return null;
  if (typeof input === "number") return input;
  const s = input.toString().trim();
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*(万|亿)?$/);
  if (!m || !m[1]) return null;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  if (m[2] === "万") return Math.round(n * 10000);
  if (m[2] === "亿") return Math.round(n * 100000000);
  return n;
}
