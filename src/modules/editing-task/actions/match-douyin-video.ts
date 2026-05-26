import "server-only";
import { db } from "@/db/client";
import { editing_task, live_account, douyin_video_snapshot } from "@/db/schema";
import { and, desc, eq, gte, ne } from "drizzle-orm";

export interface DouyinMatch {
  videoId: string;
  publishTime: Date;
  alreadyBoundToTaskId: number | null;
}

/**
 * 抖音视频自动绑定 service。
 *
 * 匹配逻辑：
 * 1. 取 task 的 anchor_id + edited_uploaded_at + live_account.platform。
 * 2. platform !== '抖音' → null（非抖音账号无需绑定）。
 * 3. 在 douyin_video_snapshot 中，按 anchor_id 找
 *    publish_time >= edited_uploaded_at 且 is_secret=0（公开）的最近视频。
 *    同一 item_id 可能有多个 snapshot_date 快照行，取 publish_time 最大的去重后首条。
 * 4. 检查该 item_id 是否已被其他任务绑定（editing_task.video_id）。
 *
 * Join 路径：
 *   editing_task.anchor_id ──→ douyin_video_snapshot.anchor_id
 *   editing_task.live_account_id ──→ live_account.id（只用来确认 platform）
 *
 * 兜底：任何条件不满足（无 anchor_id / 非抖音 / 无匹配视频）均返回 null，
 * 不阻塞 markPublished 主流程（T18 自行决策是否 throw）。
 */
export async function matchDouyinVideo(taskId: number): Promise<DouyinMatch | null> {
  // ── Step 1: 取任务基本信息 ────────────────────────────────────────────────
  const [task] = await db
    .select({
      edited_uploaded_at: editing_task.edited_uploaded_at,
      anchor_id: editing_task.anchor_id,
      platform: live_account.platform,
    })
    .from(editing_task)
    .leftJoin(live_account, eq(live_account.id, editing_task.live_account_id))
    .where(eq(editing_task.id, taskId));

  if (!task) return null;
  if (!task.edited_uploaded_at) return null;
  if (!task.anchor_id) return null;
  if (task.platform !== "抖音") return null;

  // ── Step 2: 找时间窗内公开视频 ───────────────────────────────────────────
  // publish_time >= edited_uploaded_at，is_secret=0，按 publish_time desc。
  // limit(10) 后在应用层去重 item_id（同视频多快照，publish_time 相同，排序幂等）。
  const windowStart = task.edited_uploaded_at;

  const videos = await db
    .select({
      item_id: douyin_video_snapshot.item_id,
      publish_time: douyin_video_snapshot.publish_time,
    })
    .from(douyin_video_snapshot)
    .where(
      and(
        eq(douyin_video_snapshot.anchor_id, task.anchor_id),
        eq(douyin_video_snapshot.is_secret, 0),
        gte(douyin_video_snapshot.publish_time, windowStart),
      ),
    )
    .orderBy(desc(douyin_video_snapshot.publish_time))
    .limit(10);

  if (videos.length === 0) return null;

  // 应用层去重 item_id，保留 publish_time 最大行（因已 desc 排序，首次出现即最大）
  const seen = new Set<string>();
  let best: { item_id: string; publish_time: Date } | null = null;
  for (const v of videos) {
    if (!seen.has(v.item_id)) {
      seen.add(v.item_id);
      if (!best) best = v; // 第一个（publish_time 最大）即为目标
    }
  }
  if (!best) return null;

  // ── Step 3: 检查是否已被其他任务绑定 ─────────────────────────────────────
  const [alreadyBound] = await db
    .select({ id: editing_task.id })
    .from(editing_task)
    .where(and(eq(editing_task.video_id, best.item_id), ne(editing_task.id, taskId)))
    .limit(1);

  return {
    videoId: best.item_id,
    publishTime: best.publish_time,
    alreadyBoundToTaskId: alreadyBound?.id ?? null,
  };
}
