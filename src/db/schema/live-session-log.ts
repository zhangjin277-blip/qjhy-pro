import { bigint, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { live_account } from "./live-account";
import { dingtalk_user } from "./dingtalk";

/**
 * 主播开播 / 下播打卡记录（替代/补充排班系统）。
 *
 * 流程：
 *   1. 主播钉钉扫账号二维码 → /checkin/<live_account_id>
 *   2. 钉钉 OAuth 拿 dingtalk_user_id → 检查 dept_ids ∈ 主播部门
 *   3. 状态机：
 *      - 该账号无 in_progress session  → 显示「开播」按钮 → INSERT
 *      - 该账号当前主播 = 自己          → 显示「下播」按钮 → UPDATE end_at + status='ended'
 *      - 该账号当前主播 = 别人          → 显示「接班」按钮 → 旧 UPDATE 'auto_closed_by_next'
 *                                                          + 新 INSERT
 *   4. 兜底：worker sync-kuaishou-today-live 跑完比对，in_progress 但 today-live
 *           已消失 → auto_closed_by_offline
 */
export const live_session_log = pgTable(
  "live_session_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    live_account_id: text("live_account_id")
      .notNull()
      .references(() => live_account.id, { onDelete: "restrict" }),
    anchor_dingtalk_user_id: text("anchor_dingtalk_user_id")
      .notNull()
      .references(() => dingtalk_user.user_id),
    start_at: timestamp("start_at", { withTimezone: true }).notNull().defaultNow(),
    end_at: timestamp("end_at", { withTimezone: true }),
    duration_seconds: bigint("duration_seconds", { mode: "number" }), // end_at - start_at，end 时算
    /**
     * in_progress     : 进行中（end_at IS NULL）
     * ended           : 主播主动下播
     * auto_closed_by_next     : 被下一班接班自动下播
     * auto_closed_by_offline  : 系统检测直播间已关，兜底自动下播
     * auto_closed_by_cron     : 兜底 cron 强行关（24h 仍未下播）
     */
    status: text("status").notNull().default("in_progress"),
    closed_by: text("closed_by"), // null|'self'|'next_anchor'|'system_offline'|'system_cron'
    next_anchor_dingtalk_user_id: text("next_anchor_dingtalk_user_id"), // 被接班时记录接班者
    raw: jsonb("raw").notNull().default({}),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idx_account: index("idx_live_session_log_account").on(t.live_account_id),
    idx_anchor: index("idx_live_session_log_anchor").on(t.anchor_dingtalk_user_id),
    idx_start: index("idx_live_session_log_start").on(t.start_at),
    idx_status: index("idx_live_session_log_status").on(t.status),
    // 一个账号同一时刻只能有一个 in_progress：用 partial unique
    // 走 raw SQL 创建，drizzle 不支持 partial unique 表达式
  }),
);
