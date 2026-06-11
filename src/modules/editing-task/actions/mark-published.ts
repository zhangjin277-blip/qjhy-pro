"use server";
import { db } from "@/db/client";
import { editing_task, live_account } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { writeEvent } from "../event-writer";
import { requireEditingWriter } from "../authz";
import { buildEditingScopeWhere } from "../scope";
import { assertTransition } from "../state-machine";
import { MarkPublishedInput } from "../schema";
import { matchDouyinVideo } from "./match-douyin-video";

type MarkResult =
  | { ok: true; videoId: string | null; autoMatched: boolean }
  | {
      ok: false;
      reason: "need_video_id";
      suggestion: { videoId: string; alreadyBoundToTaskId: number | null } | null;
    };

export async function markPublished(input: unknown): Promise<MarkResult> {
  const data = MarkPublishedInput.parse(input);
  const { userId, perm } = await requireEditingWriter();
  const scopeWhere = await buildEditingScopeWhere({ scope: perm.scope, userId });

  const [t] = await db
    .select({
      status: editing_task.status,
      platform: live_account.platform,
    })
    .from(editing_task)
    .leftJoin(live_account, eq(live_account.id, editing_task.live_account_id))
    .where(and(eq(editing_task.id, data.taskId), isNull(editing_task.deleted_at), scopeWhere));
  if (!t) throw new Error("task not found");
  assertTransition(t.status, "published");

  let videoId: string | null;
  let autoMatched = false;

  if (data.videoId === undefined) {
    // 非抖音平台直接发布，不弹手填（快手等没有抖音 video_id 概念）
    if (t.platform !== "抖音") {
      videoId = null;
    } else {
      // 抖音平台走自动匹配
      const match = await matchDouyinVideo(data.taskId);
      if (match && match.alreadyBoundToTaskId == null) {
        videoId = match.videoId;
        autoMatched = true;
      } else if (match) {
        // 候选视频已被其他任务绑定（查询排除 + 这里双保险）：不能静默双绑，降级为手动确认
        return {
          ok: false,
          reason: "need_video_id",
          suggestion: {
            videoId: match.videoId,
            alreadyBoundToTaskId: match.alreadyBoundToTaskId,
          },
        };
      } else {
        return { ok: false, reason: "need_video_id", suggestion: null };
      }
    }
  } else if (data.videoId === null) {
    // 跳过手填 → 直接发布、不绑定抖音视频（任何人可用，抖音 ID 非必填）
    videoId = null;
  } else {
    // 手填
    videoId = data.videoId;
  }

  // UPDATE 带前状态守卫：两人同时点发布只有一个生效（防重复 published 事件 + 覆盖发布人）
  await db.transaction(async (tx) => {
    const rows = await tx
      .update(editing_task)
      .set({
        status: "published",
        published_by_user_id: userId,
        published_at: new Date(),
        video_id: videoId,
      })
      .where(and(eq(editing_task.id, data.taskId), eq(editing_task.status, t.status)))
      .returning({ id: editing_task.id });
    if (rows.length === 0) throw new Error("任务状态已变化，请刷新");

    await writeEvent(
      {
        taskId: data.taskId,
        eventType: "published",
        actorUserId: userId,
        payload: { video_id: videoId, auto_matched: autoMatched },
      },
      tx,
    );
  });

  return { ok: true, videoId, autoMatched };
}
