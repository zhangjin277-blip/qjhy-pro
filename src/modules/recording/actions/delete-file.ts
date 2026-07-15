"use server";
import { revalidatePath } from "next/cache";
import { requireRecordingPoint } from "../authz";
import { deleteRecordingFile } from "../files";
import { getRecorderSnapshot, recordingAnchorNames } from "../snapshot";
import { DeleteRecordingFileInput } from "../schema";
import type { ActionResult } from "../types";

/**
 * 物理删除录像文件。录制中保护:快照主播集合 + mtime 兜底(见 files.ts)。
 * 业务错误一律走返回值(生产 Server Action throw 的 message 会被 Next 脱敏)——
 * 删除保护的具体原因("该主播正在录制中,禁止删除其文件")靠这个通道才能传到 UI。
 */
export async function deleteRecording(input: unknown): Promise<ActionResult> {
  try {
    const data = DeleteRecordingFileInput.parse(input);
    await requireRecordingPoint("file_delete");
    const snap = await getRecorderSnapshot(); // 离线时返回 online=false,集合可能为空,mtime 规则兜底
    await deleteRecordingFile(data.anchor, data.file, recordingAnchorNames(snap));
    revalidatePath("/recording/files");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "操作失败" };
  }
}
