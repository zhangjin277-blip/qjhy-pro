"use server";
import { revalidatePath } from "next/cache";
import { requireRecordingPoint } from "../authz";
import { recorderRequest } from "../client";
import { AddStreamerInput } from "../schema";
import type { ActionResult } from "../types";

/**
 * 添加录制主播。url 支持整段直播间链接(可带 ",主播:名字" 后缀),platform 兜底 Douyin。
 * 业务错误一律走返回值(生产 Server Action throw 的 message 会被 Next 脱敏)。
 */
export async function addStreamer(input: unknown): Promise<ActionResult> {
  try {
    const data = AddStreamerInput.parse(input);
    await requireRecordingPoint("task_manage");
    await recorderRequest("/api/v1/builtin_recorder/add", { platform: "Douyin", url: data.url });
    revalidatePath("/recording");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "操作失败" };
  }
}
