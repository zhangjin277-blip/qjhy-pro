"use server";
import { db } from "@/db/client";
import { editing_task, live_account } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/page-auth";
import { writeEvent } from "../event-writer";
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
  const { userId } = await requireUser();

  const [t] = await db
    .select({
      status: editing_task.status,
      platform: live_account.platform,
    })
    .from(editing_task)
    .leftJoin(live_account, eq(live_account.id, editing_task.live_account_id))
    .where(eq(editing_task.id, data.taskId));
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
      if (match) {
        videoId = match.videoId;
        autoMatched = true;
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

  await db
    .update(editing_task)
    .set({
      status: "published",
      published_by_user_id: userId,
      published_at: new Date(),
      video_id: videoId,
    })
    .where(eq(editing_task.id, data.taskId));

  await writeEvent({
    taskId: data.taskId,
    eventType: "published",
    actorUserId: userId,
    payload: { video_id: videoId, auto_matched: autoMatched },
  });

  return { ok: true, videoId, autoMatched };
}
