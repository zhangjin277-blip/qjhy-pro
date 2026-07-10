"use server";
import { revalidatePath } from "next/cache";
import { requireRecordingWriter } from "../authz";
import { recorderRequest } from "../client";
import { ControlStreamerInput } from "../schema";

/** 暂停/恢复/删除单个录制任务(引擎状态机动作,删除不影响已落盘文件)。 */
export async function controlStreamer(input: unknown): Promise<{ ok: true }> {
  const data = ControlStreamerInput.parse(input);
  await requireRecordingWriter();
  await recorderRequest("/api/v1/builtin_recorder/control", {
    action: data.action,
    platform: data.platform,
    room_id: data.roomId,
  });
  revalidatePath("/recording");
  return { ok: true };
}
