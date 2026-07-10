"use server";
import { revalidatePath } from "next/cache";
import { requireRecordingWriter } from "../authz";
import { recorderRequest } from "../client";
import { AddStreamerInput } from "../schema";

/** 添加录制主播。url 支持整段直播间链接(可带 ",主播:名字" 后缀),platform 兜底 Douyin。 */
export async function addStreamer(input: unknown): Promise<{ ok: true }> {
  const data = AddStreamerInput.parse(input);
  await requireRecordingWriter();
  await recorderRequest("/api/v1/builtin_recorder/add", { platform: "Douyin", url: data.url });
  revalidatePath("/recording");
  return { ok: true };
}
