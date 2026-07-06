import * as XLSX from "xlsx";
import type { ParseResult, ParsedRow } from "./xlsx-adapter";

/**
 * Omni 钉钉机器人推送的 Excel 解析器（新格式，累计快照）。
 *
 * 格式：
 *   r1: "推送时间：YYYY-MM-DD HH:MM:SS"
 *   r2: (空)
 *   r3: 表头 [账户备注, 消耗, 新增, 新增成本, 首日付费, 昨日同刻消耗, 消耗环比]
 *   r4+: 数据行
 *
 * 跟老百应导出的区别：
 * - 没有日期/小时列 → 从 r1 推送时间提取
 * - 数据是当日 0:00 累计到推送时刻的累计值（不是小时增量）
 * - 弃用 3 列：新增成本（cpa 系统算）/ 昨日同刻消耗（不存）/ 消耗环比（按区间算）
 *
 * 入库流程依赖现有 ingest.ts 的 excel-upload 路径（写 placement_cumulative_raw
 * 再重算 placement_row），跨次上传天然做差分。
 */
// 账户标签列：平台改过列名，按优先级取第一个非空：
//   渠道报表账户备注（=旧「账户备注」=placement_label，捕鱼大作战报表带这列，精确匹配）
//   账户备注（更旧格式兜底）
//   直播间（途游休闲捕鱼报表只有这列，值是简称）
const COL_ACCOUNT_ALIASES = ["渠道报表账户备注", "账户备注", "直播间"];
const COL_COST = "消耗";
const COL_ACTIVATIONS = "新增";
const COL_PAYMENT = "首日付费";

/** 识别是否 Omni 推送格式（cell A1 是 "推送时间：..."） */
export function isOmniFormat(buffer: Buffer | ArrayBuffer): boolean {
  try {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return false;
    const sheet = wb.Sheets[sheetName];
    if (!sheet) return false;
    const a1 = sheet["A1"]?.v;
    return typeof a1 === "string" && a1.includes("推送时间");
  } catch {
    return false;
  }
}

/**
 * 从 "推送时间：2026-05-20 17:40:36" 解析出 date + hour。
 *
 * hour 归属规则（让 Omni 同小时多次推送覆盖到同一行 + 跨小时前 18 分钟归前一小时）：
 *   HH:00 ~ HH:18 → hour = HH-1 （新小时刚开始 ≤18 分钟，算前一小时收尾累计）
 *   HH:19 ~ HH:59 → hour = HH   （已进入 HH 这小时 19 分钟以上，归当前小时）
 *
 * Omni 默认每 20 分钟推一次（HH:01 / HH:21 / HH:41），按此规则：
 *   13:21 → hour=13
 *   13:41 → hour=13（覆盖 13:21）
 *   14:01 → hour=13（min<19，归 14-1=13，继续覆盖；表示 13 点这小时完整 1h 结束的累计）
 *   14:21 → hour=14（新一行）
 *
 * 边界：HH=0 且 min<19 → 回滚到前一天 hour=23（"昨天 23 点收尾累计"）。
 * 若不回滚，凌晨推送带来的"全天累计"会被误存为新一天 hour=0，
 * computeIncrements 里 date 内首行不做差分 → 新一天 hour=0 增量 = 昨天全天。
 */
function parsePushTime(text: string): { date: string; hour: number } | null {
  const m = text.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mm] = m;
  const pushedH = Math.min(23, Math.max(0, Number(h)));
  const pushedM = Number(mm);
  if (pushedH === 0 && pushedM < 19) {
    // 跨日回滚：date -= 1, hour = 23
    const prev = new Date(`${y}-${mo}-${d}T00:00:00Z`);
    prev.setUTCDate(prev.getUTCDate() - 1);
    const py = prev.getUTCFullYear();
    const pmo = String(prev.getUTCMonth() + 1).padStart(2, "0");
    const pd = String(prev.getUTCDate()).padStart(2, "0");
    return { date: `${py}-${pmo}-${pd}`, hour: 23 };
  }
  const hour = pushedM < 19 ? pushedH - 1 : pushedH;
  return { date: `${y}-${mo}-${d}`, hour };
}

function toNumber(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim().replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function parseOmniXlsx(buffer: Buffer | ArrayBuffer, filename: string): ParseResult {
  const errors: { row?: unknown; reason: string }[] = [];
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return {
      rows: [],
      errors: [{ reason: "Excel 文件无 sheet" }],
      date_range_from: null,
      date_range_to: null,
    };
  }
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    return {
      rows: [],
      errors: [{ reason: "Excel 文件 sheet 读取失败" }],
      date_range_from: null,
      date_range_to: null,
    };
  }

  // 推送时间从 A1 cell 取
  const a1 = sheet["A1"]?.v;
  if (typeof a1 !== "string") {
    return {
      rows: [],
      errors: [{ reason: `Omni 格式但 A1 不是字符串：${String(a1)}` }],
      date_range_from: null,
      date_range_to: null,
    };
  }
  const pushedAt = parsePushTime(a1);
  if (!pushedAt) {
    return {
      rows: [],
      errors: [{ reason: `推送时间格式不识别：${a1}` }],
      date_range_from: null,
      date_range_to: null,
    };
  }

  // header 在第 3 行（index=2），数据从第 4 行开始
  // 用 sheet_to_json + range=2 跳过前两行（A1 标题行 + 空行）
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    range: 2,
    defval: null,
  });

  const rows: ParsedRow[] = [];
  for (const row of rawRows) {
    // 跳过完全空行
    if (Object.values(row).every((v) => v === null || v === undefined || String(v).trim() === "")) {
      continue;
    }

    let accountName = "";
    for (const col of COL_ACCOUNT_ALIASES) {
      const v = row[col];
      if (v !== null && v !== undefined && String(v).trim() !== "") {
        accountName = String(v).trim();
        break;
      }
    }
    if (!accountName) {
      errors.push({ row, reason: "缺少账户标签列（渠道报表账户备注/账户备注/直播间）" });
      continue;
    }
    if (accountName === "--" || accountName === "-") continue;

    rows.push({
      account_name: accountName,
      // 一个 placement_label 对应一个 live_account（unique），subaccount 用同名占位
      subaccount_name: accountName,
      date: pushedAt.date,
      hour: pushedAt.hour,
      cost_yuan: toNumber(row[COL_COST]),
      activations: Math.round(toNumber(row[COL_ACTIVATIONS])),
      payment_yuan: toNumber(row[COL_PAYMENT]),
      start_download: 0, // Omni 不提供
      finish_download: 0,
      raw: { ...row, _pushed_at: a1, _source_filename: filename },
    });
  }

  return {
    rows,
    errors,
    date_range_from: pushedAt.date,
    date_range_to: pushedAt.date,
  };
}
