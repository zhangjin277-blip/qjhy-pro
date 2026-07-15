"use server";
import { revalidatePath } from "next/cache";
import { requireRecordingPoint } from "../authz";
import { recorderRequest } from "../client";
import { ControlStreamerInput } from "../schema";
import type { ActionResult } from "../types";

/**
 * 暂停/恢复/删除单个录制任务(引擎状态机动作,删除不影响已落盘文件)。
 * 业务错误一律走返回值(生产 Server Action throw 的 message 会被 Next 脱敏)。
 */
export async function controlStreamer(input: unknown): Promise<ActionResult> {
  try {
    const data = ControlStreamerInput.parse(input);
    await requireRecordingPoint("task_manage");
    await recorderRequest("/api/v1/builtin_recorder/control", {
      action: data.action,
      platform: data.platform,
      room_id: data.roomId,
    });
    revalidatePath("/recording");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "操作失败" };
  }
}
