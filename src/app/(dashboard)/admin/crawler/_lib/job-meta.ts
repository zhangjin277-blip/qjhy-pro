/** 采集监控页共享：job 显示名 / 状态名 / output 摘要格式化 */

export const JOB_LABEL: Record<string, string> = {
  "crawler:check_data_ready": "数据就绪检查",
  "crawler:fetch_profile": "主播档案",
  "crawler:fetch_daily": "主播日报",
  "crawler:fetch_portrait": "主播肖像",
  "crawler:fetch_game": "推广游戏",
  "crawler:fetch_minigame": "小游戏",
  "crawler:fetch_video": "视频快照",
  "crawler:sync_kuaishou_members": "快手·成员同步",
  "crawler:sync_kuaishou_history_live": "快手·历史直播",
  "crawler:sync_kuaishou_today_live": "快手·今日实时",
  "crawler:sync_kuaishou_live_snapshot": "快手·直播趋势快照",
  "crawler:sync_zhaohua_official_replays": "抖音灵机·官号复盘",
  "crawler:sync_zhaohua_official_videos": "抖音创作者中心·孙小圣",
  "crawler:sync_xiaomowan_official_videos": "抖音创作者中心·小魔丸",
};

export const STATE_LABEL: Record<string, string> = {
  created: "排队中",
  retry: "重试中",
  active: "运行中",
  completed: "完成",
  cancelled: "取消",
  failed: "失败",
  expired: "过期",
};

/** 每 5~10 分钟跑一次的高频任务：流水表默认隐藏，避免把人工关心的记录刷出屏 */
export const HIGH_FREQ_JOBS = [
  "crawler:sync_kuaishou_live_snapshot",
  "crawler:sync_kuaishou_today_live",
];

/**
 * 把 handler 返回的 output（pgboss.job.output）格式化成简短文本。
 * 各 handler 字段不一致，按优先级提取常用统计字段。
 */
export function formatOutputSummary(output: Record<string, unknown> | null): string {
  if (!output) return "—";
  const num = (k: string): number | null => {
    const v = output[k];
    return typeof v === "number" ? v : null;
  };
  const inserted = num("inserted");
  const updated = num("updated");
  const total = num("total");
  const sessions = num("sessions");
  const rows = num("rows");
  const fail = num("fail");
  const failed = num("failed");
  const unmatched = num("unmatched");
  const skippedHistory = num("skippedHistory");
  const upserted = num("upserted");
  const trendPointsUpserted = num("trendPointsUpserted");
  const skipped = num("skipped");
  const works = num("works");
  const daily = num("daily");
  if (works !== null && daily !== null) return `${works} 个作品 · ${daily} 天汇总`;
  if (trendPointsUpserted !== null) {
    const parts = [`${trendPointsUpserted} 个趋势点`];
    if (failed !== null && failed > 0) parts.push(`失败 ${failed}`);
    if (sessions !== null && sessions > 0) parts.push(`${sessions} 场`);
    return parts.join(" · ");
  }
  if (upserted !== null) {
    return skipped && skipped > 0 ? `${upserted} 场 · 跳过 ${skipped}` : `${upserted} 场`;
  }
  if (inserted !== null && updated !== null) {
    const parts = [`+${inserted}`, `~${updated}`];
    if (skippedHistory !== null && skippedHistory > 0) parts.push(`跳${skippedHistory}`);
    return parts.join(" / ");
  }
  if (rows !== null) {
    const parts = [`${rows} 行`];
    if (fail !== null && fail > 0) parts.push(`失败 ${fail}`);
    if (failed !== null && failed > 0) parts.push(`失败 ${failed}`);
    if (unmatched !== null && unmatched > 0) parts.push(`未匹配 ${unmatched}`);
    return parts.join(" · ");
  }
  if (total !== null) return `${total} 行`;
  if ("ready" in output) return output.ready === true ? "就绪" : "未就绪";
  return "—";
}
