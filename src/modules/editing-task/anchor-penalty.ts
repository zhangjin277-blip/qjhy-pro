import "server-only";
import { db } from "@/db/client";
import { anchor_score, anchor_score_log, editing_task, anchor_profile } from "@/db/schema";
import { and, eq, sql, isNull, isNotNull } from "drizzle-orm";
import { sendDingtalkMarkdown } from "@/lib/notify/dingtalk-bot";

export interface PenaltyResult {
  date: string;
  penalized: { anchorId: string; anchorName: string; product: string }[];
}

/**
 * 每日扣分逻辑（默认处理昨天）。
 *
 * 规则：捕鱼系主播昨天有开播记录（live_session_log）但没上传剪辑素材 → 扣 1 分。
 * 幂等：anchor_score_log 有 unique(anchor_id, stat_date, reason) 约束，重跑安全。
 */
export async function runDailyPenalty(targetDate?: string): Promise<PenaltyResult> {
  // 默认昨天（本机时间减 24h）
  const yesterday = targetDate ? new Date(targetDate) : new Date(Date.now() - 86400000);
  yesterday.setHours(0, 0, 0, 0);
  const dateStr = yesterday.toISOString().slice(0, 10);

  const periodStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), 1);

  // ── 1. 查昨天有开播记录的捕鱼系主播 ──────────────────────────────────────────
  // live_session_log.anchor_dingtalk_user_id → anchor_profile.dingtalk_user_id → anchor_id
  // live_account.product ILIKE '%捕鱼%'（兼容"捕鱼大作战"等）
  // 按 start_at 的 DATE（Asia/Shanghai 时区）筛选昨天
  const broadcastedResult = await db.execute(sql`
    SELECT DISTINCT
      ap.anchor_id,
      ap.nick_name,
      la.product
    FROM live_session_log sl
    JOIN live_account la ON la.id = sl.live_account_id
    JOIN anchor_profile ap ON ap.dingtalk_user_id = sl.anchor_dingtalk_user_id
    WHERE (sl.start_at AT TIME ZONE 'Asia/Shanghai')::date = ${dateStr}::date
      AND la.product ILIKE '%捕鱼%'
  `);
  const broadcastedRows = broadcastedResult as unknown as {
    anchor_id: string;
    nick_name: string;
    product: string;
  }[];

  if (broadcastedRows.length === 0) {
    return { date: dateStr, penalized: [] };
  }

  // ── 2. 查昨天已上传素材的主播 ─────────────────────────────────────────────────
  const uploadedRows = await db
    .select({ anchor_id: editing_task.anchor_id })
    .from(editing_task)
    .where(
      and(
        eq(editing_task.material_date, yesterday),
        isNotNull(editing_task.source_uploaded_at),
        isNotNull(editing_task.anchor_id),
        isNull(editing_task.deleted_at),
      ),
    );

  const uploadedSet = new Set(
    uploadedRows.map((r) => r.anchor_id).filter((x): x is string => x !== null),
  );

  // ── 3. 缺失 = 开播了但没上传 ─────────────────────────────────────────────────
  const penalized: PenaltyResult["penalized"] = broadcastedRows
    .filter((r) => !uploadedSet.has(r.anchor_id))
    .map((r) => ({
      anchorId: r.anchor_id,
      anchorName: r.nick_name ?? "(未命名)",
      product: r.product,
    }));

  if (penalized.length === 0) {
    return { date: dateStr, penalized: [] };
  }

  // ── 4. 写 score_log（unique 约束防重复）+ 更新 score ──────────────────────────
  for (const p of penalized) {
    try {
      // 先插 log；若 unique 冲突则说明已扣过，跳过
      await db.insert(anchor_score_log).values({
        anchor_id: p.anchorId,
        change: -1,
        reason: "捕鱼系未上传素材",
        stat_date: yesterday,
      });

      // upsert score（新月份新行，旧行累减）
      await db
        .insert(anchor_score)
        .values({
          anchor_id: p.anchorId,
          period_start: periodStart,
          score: -1,
        })
        .onConflictDoUpdate({
          target: [anchor_score.anchor_id, anchor_score.period_start],
          set: {
            score: sql`${anchor_score.score} - 1`,
            updated_at: new Date(),
          },
        });
    } catch (err: unknown) {
      // unique 冲突抛 PostgresError code 23505，属于"已处理"，其余才是真错
      const code = (err as { code?: string }).code;
      if (code === "23505") {
        console.log(`[anchor-penalty] anchor ${p.anchorId} already penalized for ${dateStr}, skip`);
      } else {
        console.error(`[anchor-penalty] anchor ${p.anchorId} error:`, err);
      }
    }
  }

  // ── 5. 钉钉通知 ────────────────────────────────────────────────────────────
  try {
    const lines = penalized.map((p) => `- ${p.product} · ${p.anchorName}`).join("\n");
    await sendDingtalkMarkdown(
      `捕鱼系扣分（${dateStr}）`,
      [
        `### 捕鱼系未上传素材扣分（${dateStr}）`,
        "",
        `共 **${penalized.length}** 个主播昨日开播但未上传剪辑素材，每人扣 1 分：`,
        "",
        lines,
      ].join("\n"),
    );
  } catch {
    // 通知失败不影响主流程
  }

  return { date: dateStr, penalized };
}

/**
 * 月度清零（保留接口）。
 * 当前实现：score 按 period_start 分月存储，月度自动隔离，本函数为 no-op。
 */
export async function runMonthlyReset(): Promise<{ resetCount: number }> {
  return { resetCount: 0 };
}

/**
 * 查询指定月份的主播积分排行（升序，分数越低扣得越多）。
 * periodStart: Date 对象，月份 1 号。
 */
export async function queryMonthRanking(
  periodStart: Date,
): Promise<{ anchorId: string; anchorName: string | null; score: number }[]> {
  const rows = await db
    .select({
      anchor_id: anchor_score.anchor_id,
      nick_name: anchor_profile.nick_name,
      score: anchor_score.score,
    })
    .from(anchor_score)
    .leftJoin(anchor_profile, eq(anchor_profile.anchor_id, anchor_score.anchor_id))
    .where(eq(anchor_score.period_start, periodStart))
    .orderBy(anchor_score.score);

  return rows.map((r) => ({
    anchorId: r.anchor_id,
    anchorName: r.nick_name ?? null,
    score: r.score,
  }));
}
