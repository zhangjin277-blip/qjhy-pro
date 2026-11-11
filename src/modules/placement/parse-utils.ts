/** "5746元" → 5746；"4.08%" → 4.08；"" → 0 */
export function parseUnitNumber(input: unknown): number {
  if (input == null) return 0;
  if (typeof input === "number") return Number.isFinite(input) ? input : 0;
  if (typeof input !== "string") return 0;
  const trimmed = input.trim();
  if (!trimmed) return 0;
  const cleaned = trimmed.replace(/[元¥％%,\s]|分钟|小时|秒/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

/** "2026年05月06日" → "2026-05-06"；"2026-05-06" → "2026-05-06" */
export function parseDateText(input: unknown): string | null {
  if (typeof input === "number" && Number.isFinite(input) && input > 0) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(input) * 86_400_000);
    return date.toISOString().slice(0, 10);
  }
  if (input instanceof Date && Number.isFinite(input.getTime())) {
    return input.toISOString().slice(0, 10);
  }
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const cn = trimmed.match(/^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日$/);
  if (cn) {
    const y = cn[1];
    const m = cn[2] ?? "01";
    const d = cn[3] ?? "01";
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return trimmed;
  const short = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (short) {
    const month = Number(short[1]);
    const day = Number(short[2]);
    const rawYear = Number(short[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return date.toISOString().slice(0, 10);
    }
  }
  return null;
}

/**
 * 19 / "19" / "19:00" / "19点" → 19；超 0-24 → null。
 * 注意：返回 0-24 原始值（含 24）。语义归一化由 adapter 负责：
 * - PRO3 (0-23 起点编号) 直接存
 * - Excel 上传 (1-24 终点编号) 需 -1 转起点（adapter 内做）
 */
export function parseHour(input: unknown): number | null {
  if (typeof input === "number") {
    if (Number.isInteger(input) && input >= 0 && input <= 24) return input;
    return null;
  }
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const colonMatch = trimmed.match(/^(\d{1,2}):/);
  if (colonMatch) {
    const h = Number(colonMatch[1]);
    return h >= 0 && h <= 24 ? h : null;
  }
  const cnMatch = trimmed.match(/^(\d{1,2})点$/);
  if (cnMatch) {
    const h = Number(cnMatch[1]);
    return h >= 0 && h <= 24 ? h : null;
  }
  const num = Number(trimmed);
  if (Number.isInteger(num) && num >= 0 && num <= 24) return num;
  return null;
}
