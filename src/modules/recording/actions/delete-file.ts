"use server";
import { revalidatePath } from "next/cache";
import { requireRecordingWriter } from "../authz";
import { deleteRecordingFile } from "../files";
import { getRecorderSnapshot, recordingAnchorNames } from "../snapshot";
import { DeleteRecordingFileInput } from "../schema";

/** 物理删除录像文件。录制中保护:快照主播集合 + mtime 兜底(见 files.ts)。 */
export async function deleteRecording(input: unknown): Promise<{ ok: true }> {
  const data = DeleteRecordingFileInput.parse(input);
  await requireRecordingWriter();
  const snap = await getRecorderSnapshot(); // 离线时返回 online=false,集合可能为空,mtime 规则兜底
  await deleteRecordingFile(data.anchor, data.file, recordingAnchorNames(snap));
  revalidatePath("/recording/files");
  return { ok: true };
}
