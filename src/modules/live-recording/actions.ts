"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/page-auth";
import {
  deleteRecording,
  readCategories,
  readRetention,
  readUrlsFile,
  writeCategories,
  writeRetention,
  writeUrlsFile,
} from "./files";
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

/**
 * 加录制主播(url 原样写入,go-recorder 自己解析平台)。读-改-写降低竞态。
 * retentionDays > 0 时同时写保存时长(0 = 永久,不写)。
 */
export async function addStreamerAction(
  url: string,
  name: string,
  retentionDays = 0,
): Promise<ActionResult> {
  return ok(async () => {
    const content = await readUrlsFile();
    await writeUrlsFile(addStreamerLine(content, url, name));
    if (retentionDays > 0) {
      const ret = await readRetention();
      ret.byUrl[url.trim()] = Math.floor(retentionDays);
      await writeRetention(ret);
    }
  });
}

/** 设置某主播录像保存天数(days <= 0 = 永久,即删除该主播的保存设置) */
export async function setRetentionAction(url: string, days: number): Promise<ActionResult> {
  return ok(async () => {
    const ret = await readRetention();
    if (days > 0) {
      ret.byUrl[url] = Math.floor(days);
    } else {
      ret.byUrl = Object.fromEntries(Object.entries(ret.byUrl).filter(([k]) => k !== url));
    }
    await writeRetention(ret);
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

export type BatchDeleteResult =
  | { ok: true; deleted: number; failed: { file: string; error: string }[] }
  | { ok: false; error: string };

/** 新建自定义分类 */
export async function addCategoryAction(name: string): Promise<ActionResult> {
  return ok(async () => {
    const n = name.trim();
    if (!n) throw new Error("分类名不能为空");
    const data = await readCategories();
    if (!data.categories.includes(n)) {
      data.categories.push(n);
      await writeCategories(data);
    }
  });
}

/** 删除分类(同时把归属该分类的主播清为未分类) */
export async function deleteCategoryAction(name: string): Promise<ActionResult> {
  return ok(async () => {
    const data = await readCategories();
    data.categories = data.categories.filter((c) => c !== name);
    data.byUrl = Object.fromEntries(Object.entries(data.byUrl).filter(([, v]) => v !== name));
    await writeCategories(data);
  });
}

/** 给某主播设置分类(category 传空串 = 取消分类) */
export async function assignCategoryAction(url: string, category: string): Promise<ActionResult> {
  return ok(async () => {
    const data = await readCategories();
    if (category) {
      data.byUrl[url] = category;
    } else {
      data.byUrl = Object.fromEntries(Object.entries(data.byUrl).filter(([k]) => k !== url));
    }
    await writeCategories(data);
  });
}

/** 批量物理删除录像文件;逐个删,汇总成功数与失败项(单个失败不影响其他)。 */
export async function deleteFilesAction(
  streamer: string,
  files: string[],
): Promise<BatchDeleteResult> {
  try {
    await requireUser();
    let deleted = 0;
    const failed: { file: string; error: string }[] = [];
    for (const f of files) {
      try {
        await deleteRecording(streamer, f);
        deleted += 1;
      } catch (e) {
        failed.push({ file: f, error: e instanceof Error ? e.message : "删除失败" });
      }
    }
    revalidatePath("/live-recording/files");
    return { ok: true, deleted, failed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "操作失败" };
  }
}
