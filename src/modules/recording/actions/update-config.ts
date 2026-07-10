"use server";
import { revalidatePath } from "next/cache";
import { requireRecordingWriter } from "../authz";
import { recorderRequest } from "../client";
import { UpdateRecorderConfigInput } from "../schema";
import type { ActionResult, RecorderConfig } from "../types";

/**
 * 更新全局录制配置。引擎 POST 是整体覆盖,必须先 GET 合并防丢 save_path。
 * 业务错误一律走返回值(生产 Server Action throw 的 message 会被 Next 脱敏)。
 */
export async function updateRecorderConfig(input: unknown): Promise<ActionResult> {
  try {
    const data = UpdateRecorderConfigInput.parse(input);
    await requireRecordingWriter();
    const current = await recorderRequest<RecorderConfig>("/api/v1/builtin_recorder/config");
    await recorderRequest("/api/v1/builtin_recorder/config", {
      ...current,
      quality: data.quality,
      segment_time: data.segment_time,
      check_interval: data.check_interval,
    });
    revalidatePath("/recording");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "操作失败" };
  }
}
