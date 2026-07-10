"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/page-auth";
import { deleteRecording, readUrlsFile, writeUrlsFile } from "./files";
import { addStreamer as addStreamerLine, removeAt, renameAt, setPausedAt } from "./urls";

/**
 * 写操作统一返回判别式结果(不 throw)——Next 生产会脱敏 throw 的 message,
 * 用 { ok:false, error } 让删除保护/校验等提示能真实到达前端。
 */
export type ActionResult = { ok: true } | { ok: false; error: string };

async function ok(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await requireUser();
    await fn();
    revalidatePath("/live-recording");
    revalidatePath("/live-recording/files");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "操作失败" };
  }
}

/** 加录制主播(url 原样写入,go-recorder 自己解析平台)。读-改-写降低竞态。 */
export async function addStreamerAction(url: string, name: string): Promise<ActionResult> {
  return ok(async () => {
    const content = await readUrlsFile();
    await writeUrlsFile(addStreamerLine(content, url, name));
  });
}

/** 暂停/恢复(按行号) */
export async function setPausedAction(index: number, paused: boolean): Promise<ActionResult> {
  return ok(async () => {
    const content = await readUrlsFile();
    await writeUrlsFile(setPausedAt(content, index, paused));
  });
}

/** 从名单删除某主播(按行号)——不动已录的文件 */
export async function removeStreamerAction(index: number): Promise<ActionResult> {
  return ok(async () => {
    const content = await readUrlsFile();
    await writeUrlsFile(removeAt(content, index));
  });
}

/** 改主播名(按行号) */
export async function renameStreamerAction(index: number, newName: string): Promise<ActionResult> {
  return ok(async () => {
    const content = await readUrlsFile();
    await writeUrlsFile(renameAt(content, index, newName));
  });
}

/** 物理删除某个录像文件(带录制中保护) */
export async function deleteFileAction(streamer: string, file: string): Promise<ActionResult> {
  return ok(async () => {
    await deleteRecording(streamer, file);
  });
}
