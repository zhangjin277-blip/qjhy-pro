"use server";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/page-auth";
import { writeEvent } from "../event-writer";
import { assertTransition } from "../state-machine";
import { MarkPublishedInput } from "../schema";
import { matchDouyinVideo } from "./match-douyin-video";
import { resolvePermission } from "@/modules/permissions/server";

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
    .select({ status: editing_task.status })
    .from(editing_task)
    .where(eq(editing_task.id, data.taskId));
  if (!t) throw new Error("task not found");
  assertTransition(t.status, "published");

  let videoId: string | null;
  let autoMatched = false;

  if (data.videoId === undefined) {
    // 走自动匹配
    const match = await matchDouyinVideo(data.taskId);
    if (match) {
      videoId = match.videoId;
      autoMatched = true;
    } else {
      // 未匹配 → 返回 need_video_id
      return { ok: false, reason: "need_video_id", suggestion: null };
    }
  } else if (data.videoId === null) {
    // admin 强制跳过 — 校验权限
    const perm = await resolvePermission(userId, "editing_workflow");
    if (!perm.can_admin) {
      throw new Error("仅 admin 可跳过 video_id 手填");
    }
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
