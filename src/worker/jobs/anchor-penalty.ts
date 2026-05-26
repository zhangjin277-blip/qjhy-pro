import "server-only";
import { runDailyPenalty } from "@/modules/editing-task/anchor-penalty";

/**
 * 每日 02:00 主播扣分任务（Asia/Shanghai）。
 * 规则：捕鱼系主播昨天有开播记录但未上传剪辑素材 → 扣 1 分。
 * 幂等：anchor_score_log unique(anchor_id, stat_date, reason) 防重复扣。
 */
export async function runAnchorPenaltyJob(): Promise<void> {
  console.log("[anchor-penalty] start");
  try {
    const r = await runDailyPenalty();
    console.log(`[anchor-penalty] done: penalized ${r.penalized.length} anchors (date=${r.date})`);
  } catch (err) {
    console.error("[anchor-penalty] failed:", err);
    throw err; // 让 scheduler 感知失败
  }
}
