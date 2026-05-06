// src/modules/live-account/migration.ts
import "server-only";
import Database from "better-sqlite3";
import { db } from "@/db/client";
import {
  live_account,
  live_room,
  live_anchor,
  account_anchor_default,
  dingtalk_user,
} from "@/db/schema";
import { matchName, type DingtalkCandidate } from "./name-matcher";

// PRO3 一行原始 JSON 的形状
export interface Pro3AccountRow {
  id?: string;
  accountName: string;
  platform?: string; // '抖音' | '快手' | ...
  status?: string;
  anchorName?: string;
  agent?: string;
  product?: string;
  platformAccountId?: string;
  uid?: string;
  platformRealName?: string;
  phone?: string;
  phoneIndex?: string;
  phoneRealName?: string;
  room?: string;
  gameAccount1?: string;
  gameAccount2?: string;
  gameAccount3?: string;
  schedule1?: string;
  schedule2?: string;
  schedule3?: string;
  restDay?: string;
  multiAnchor?: boolean;
  anchorList?: {
    name: string;
    schedules?: string[];
    schedule?: string;
    restDay?: string;
    remark?: string;
  }[];
}

export interface Pro3StreamAccount {
  name: string;
  dataset_anchor_name: string | null;
}

export interface MigrationReport {
  totalRows: number;
  platformCounts: Record<string, number>;
  productCounts: Record<string, number>;
  rooms: { created: number; ids: string[] };
  accounts: { created: number; ids: string[] };
  anchors: {
    matched: { pro3_name: string; dingtalk_user_id: string }[];
    pending: { pro3_name: string; candidates: DingtalkCandidate[] }[];
    unmatched: string[];
  };
  bindings: { created: number };
  errors: { row: Pro3AccountRow; reason: string }[];
}

export interface MigrationOptions {
  pro3SqlitePath: string;
  dryRun: boolean;
}

/**
 * 拆分含分隔符的姓名串（PRO3 脏数据：anchorName 字段经常被运营写成"张三/李四/王五"或"张三、李四"）。
 * 返回去重 trim 后的姓名数组。
 */
export function splitNames(s: string | undefined): string[] {
  if (!s) return [];
  const parts = s
    .split(/[/、，,]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return [...new Set(parts)];
}

/**
 * 解析"12:00-18:00" → ["12:00","18:00"]
 */
export function parseScheduleString(s: string | undefined): [string, string] | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!m || !m[1] || !m[2] || !m[3] || !m[4]) return null;
  return [`${m[1].padStart(2, "0")}:${m[2]}`, `${m[3].padStart(2, "0")}:${m[4]}`];
}

/**
 * "1" / "周一" → 1; "" / "0" / "无" → null
 */
export function parseRestDay(s: string | undefined): number | null {
  if (!s) return null;
  const num = Number(s);
  if (Number.isInteger(num) && num >= 1 && num <= 7) return num;
  const map: Record<string, number> = {
    周一: 1,
    周二: 2,
    周三: 3,
    周四: 4,
    周五: 5,
    周六: 6,
    周日: 7,
  };
  return map[s.trim()] ?? null;
}

/**
 * 读 PRO3 SQLite 中 business_data WHERE type='accounts' 的所有行
 */
export function readPro3Accounts(sqlitePath: string): Pro3AccountRow[] {
  const sqlite = new Database(sqlitePath, { readonly: true });
  try {
    const rows = sqlite
      .prepare("SELECT content FROM business_data WHERE type = 'accounts'")
      .all() as { content: string }[];
    return rows.map((r) => JSON.parse(r.content) as Pro3AccountRow);
  } finally {
    sqlite.close();
  }
}

/**
 * 读 stream_accounts 表（投放标签映射）
 */
export function readPro3StreamAccounts(sqlitePath: string): Pro3StreamAccount[] {
  const sqlite = new Database(sqlitePath, { readonly: true });
  try {
    return sqlite
      .prepare("SELECT name, dataset_anchor_name FROM stream_accounts")
      .all() as Pro3StreamAccount[];
  } finally {
    sqlite.close();
  }
}

/**
 * 主迁移函数。事务包裹，dryRun 模式仅算 report 不写库。
 */
export async function runMigration(opts: MigrationOptions): Promise<MigrationReport> {
  const rows = readPro3Accounts(opts.pro3SqlitePath);
  const streamAccounts = readPro3StreamAccounts(opts.pro3SqlitePath);
  const placementMap = new Map(streamAccounts.map((s) => [s.name, s.dataset_anchor_name]));

  const candidates: DingtalkCandidate[] = (await db
    .select({
      user_id: dingtalk_user.user_id,
      name: dingtalk_user.name,
      mobile: dingtalk_user.mobile,
    })
    .from(dingtalk_user)) as DingtalkCandidate[];

  const report: MigrationReport = {
    totalRows: rows.length,
    platformCounts: {},
    productCounts: {},
    rooms: { created: 0, ids: [] },
    accounts: { created: 0, ids: [] },
    anchors: { matched: [], pending: [], unmatched: [] },
    bindings: { created: 0 },
    errors: [],
  };

  const roomMap = new Map<string, string>(); // room_no -> live_room.id
  const matchedAnchors = new Map<string, string>(); // pro3_name -> dingtalk_user_id

  // 第一遍：统计 + 收集所有 room_no + 主播匹配
  for (const row of rows) {
    report.platformCounts[row.platform ?? "未知"] =
      (report.platformCounts[row.platform ?? "未知"] ?? 0) + 1;
    report.productCounts[row.product ?? "未知"] =
      (report.productCounts[row.product ?? "未知"] ?? 0) + 1;

    if (row.room && !roomMap.has(row.room)) {
      roomMap.set(row.room, crypto.randomUUID());
    }

    const anchorNamesInRow: string[] = [];
    // anchorName / agent 可能是 "张三/李四" 这种脏数据，先拆开
    for (const n of splitNames(row.anchorName)) anchorNamesInRow.push(n);
    if (row.anchorList) {
      for (const a of row.anchorList) {
        for (const n of splitNames(a.name)) anchorNamesInRow.push(n);
      }
    }
    for (const n of splitNames(row.agent)) anchorNamesInRow.push(n);

    for (const name of anchorNamesInRow) {
      if (matchedAnchors.has(name)) continue;
      const result = matchName(name, candidates);
      if (result.kind === "exact") {
        matchedAnchors.set(name, result.match.user_id);
        if (!report.anchors.matched.find((m) => m.pro3_name === name)) {
          report.anchors.matched.push({ pro3_name: name, dingtalk_user_id: result.match.user_id });
        }
      } else if (result.kind === "ambiguous") {
        if (!report.anchors.pending.find((p) => p.pro3_name === name)) {
          report.anchors.pending.push({ pro3_name: name, candidates: result.candidates });
        }
      } else {
        if (!report.anchors.unmatched.includes(name)) {
          report.anchors.unmatched.push(name);
        }
      }
    }
  }

  if (opts.dryRun) {
    report.rooms.created = roomMap.size;
    report.rooms.ids = [...roomMap.values()];
    return report;
  }

  // 第二遍：写库（事务包裹）
  await db.transaction(async (tx) => {
    // rooms
    for (const [room_no, id] of roomMap) {
      await tx.insert(live_room).values({ id, room_no, status: "active" }).onConflictDoNothing();
      report.rooms.created++;
      report.rooms.ids.push(id);
    }

    // accounts — 按 (platform, platform_uid) 或 account_name 去重，重复行的 binding 合并到同一 accId
    const accIdMap = new Map<string, string>(); // dedupe key → accId
    const dedupeKey = (row: Pro3AccountRow): string => {
      const platform = row.platform ?? "抖音";
      // 有 platform_uid 用 (platform, uid) 唯一识别；没有则按 account_name 兜底
      return row.uid ? `${platform}|uid:${row.uid}` : `${platform}|name:${row.accountName}`;
    };

    for (const row of rows) {
      try {
        const key = dedupeKey(row);
        const existingAccId = accIdMap.get(key);
        if (existingAccId) {
          // 重复行：复用 existing accId，跳过 insert（仅处理后面的 bindings 合并）
          await processBindings(row, existingAccId);
          continue;
        }

        const accId = crypto.randomUUID();
        accIdMap.set(key, accId);

        const room_id = row.room ? (roomMap.get(row.room) ?? null) : null;
        // agent 可能是 "陈泰/苏梓豪"，取拆分后第一个能匹配上的真人
        const agent_dingtalk_user_id =
          splitNames(row.agent)
            .map((n) => matchedAnchors.get(n))
            .find((id): id is string => Boolean(id)) ?? null;
        const placement_label = placementMap.get(row.accountName) ?? null;

        await tx.insert(live_account).values({
          id: accId,
          account_name: row.accountName,
          platform: row.platform ?? "抖音",
          platform_account_id: row.platformAccountId ?? null,
          platform_uid: row.uid ?? null,
          platform_real_name: row.platformRealName ?? null,
          phone: row.phone ?? null,
          phone_index: row.phoneIndex ?? null,
          phone_real_name: row.phoneRealName ?? null,
          room_id,
          game_account_1: row.gameAccount1 ?? null,
          game_account_2: row.gameAccount2 ?? null,
          game_account_3: row.gameAccount3 ?? null,
          product: row.product ?? "途游斗地主",
          agent_dingtalk_user_id,
          placement_label,
          live_status: row.status === "live" ? "living" : "unknown",
          raw: row as unknown as Record<string, unknown>,
        });
        report.accounts.created++;
        report.accounts.ids.push(accId);

        await processBindings(row, accId);
      } catch (e) {
        report.errors.push({ row, reason: e instanceof Error ? e.message : String(e) });
      }
    }

    /** 抽出 binding 处理逻辑，便于重复行复用 existing accId */
    async function processBindings(row: Pro3AccountRow, accId: string) {
      const bindings: {
        name: string;
        slots: [string, string][];
        restDays: number[];
        remark?: string;
      }[] = [];
      if (row.anchorList && row.anchorList.length > 0) {
        for (const a of row.anchorList) {
          const slots = (a.schedules ?? (a.schedule ? [a.schedule] : []))
            .map(parseScheduleString)
            .filter((s): s is [string, string] => s !== null);
          const rd = parseRestDay(a.restDay);
          // a.name 也可能含分隔符 → 拆开每人各建一行 binding（共享 slots/restDays/remark）
          for (const name of splitNames(a.name)) {
            bindings.push({
              name,
              slots,
              restDays: rd ? [rd] : [],
              remark: a.remark,
            });
          }
        }
      } else if (row.anchorName) {
        const slots = [row.schedule1, row.schedule2, row.schedule3]
          .map(parseScheduleString)
          .filter((s): s is [string, string] => s !== null);
        const rd = parseRestDay(row.restDay);
        for (const name of splitNames(row.anchorName)) {
          bindings.push({
            name,
            slots,
            restDays: rd ? [rd] : [],
          });
        }
      }

      for (const b of bindings) {
        if (b.slots.length === 0) continue; // 没有时段就不建 binding
        const dingId = matchedAnchors.get(b.name);
        if (!dingId) continue; // 没匹配上的主播跳过（在 report.anchors.unmatched 里）
        // 确保 live_anchor 存在（迁移时需要"自动建档"）
        await tx
          .insert(live_anchor)
          .values({
            dingtalk_user_id: dingId,
            business_line: inferBusinessLine(row.product),
            employment_type: "正式",
            work_status: "active",
          })
          .onConflictDoNothing();

        await tx
          .insert(account_anchor_default)
          .values({
            id: crypto.randomUUID(),
            account_id: accId,
            dingtalk_user_id: dingId,
            time_slots: b.slots,
            rest_days: b.restDays,
            remark: b.remark ?? null,
          })
          .onConflictDoNothing();
        report.bindings.created++;
      }
    }
  });

  return report;
}

function inferBusinessLine(product: string | undefined): "捕鱼" | "斗地主" | "麻将" {
  if (!product) return "斗地主";
  if (product.includes("捕鱼")) return "捕鱼";
  if (product.includes("麻将")) return "麻将";
  return "斗地主";
}
