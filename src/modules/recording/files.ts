import "server-only";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import type { AnchorFolder, RecordingFile } from "./types";

/**
 * 录像文件直读(挂载卷 RECORDINGS_DIR,生产 /mnt/recordings)。
 * go-recorder 落盘结构:<RECORDINGS_DIR>/<主播名>/<文件>.ts + Screenshots/ 子目录(截图,不展示)。
 * 删除是物理删除(目的即释放 NAS 空间);录制中保护见 deleteRecordingFile。
 */

const RECORDING_GRACE_MS = 2 * 60 * 1000;

function rootDir(): string {
  const d = process.env.RECORDINGS_DIR;
  if (!d) throw new Error("RECORDINGS_DIR 未配置");
  return d;
}

/** 主播名/文件名只允许单层(防路径穿越):不含分隔符、不为 . / .. */
function assertSafeName(name: string): void {
  if (
    !name ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\0")
  ) {
    throw new Error("非法路径");
  }
}

export async function listAnchorFolders(): Promise<AnchorFolder[]> {
  const root = rootDir();
  const entries = await fs.readdir(root, { withFileTypes: true });
  const folders: AnchorFolder[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    let fileCount = 0;
    let totalSize = 0;
    const files = await fs.readdir(path.join(root, e.name), { withFileTypes: true });
    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith(".ts")) continue;
      const st = await fs.stat(path.join(root, e.name, f.name)).catch(() => null);
      if (!st) continue;
      fileCount += 1;
      totalSize += st.size;
    }
    folders.push({ name: e.name, fileCount, totalSize });
  }
  return folders.sort((a, b) => b.totalSize - a.totalSize);
}

export async function listAnchorFiles(anchor: string): Promise<RecordingFile[]> {
  assertSafeName(anchor);
  const dir = path.join(rootDir(), anchor);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const now = Date.now();
  const files: RecordingFile[] = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".ts")) continue;
    const st = await fs.stat(path.join(dir, e.name)).catch(() => null);
    if (!st) continue;
    files.push({
      name: e.name,
      size: st.size,
      mtimeMs: st.mtimeMs,
      recording: now - st.mtimeMs < RECORDING_GRACE_MS,
    });
  }
  return files.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export async function statRecording(
  anchor: string,
  file: string,
): Promise<{ size: number; fullPath: string }> {
  assertSafeName(anchor);
  assertSafeName(file);
  const fullPath = path.join(rootDir(), anchor, file);
  const st = await fs.stat(fullPath);
  if (!st.isFile()) throw new Error("不是文件");
  return { size: st.size, fullPath };
}

export function getRecordingStream(
  fullPath: string,
  range?: { start: number; end: number },
): NodeJS.ReadableStream {
  return createReadStream(fullPath, range);
}

/**
 * 物理删除录像。保护:① 该主播在快照中正在录制 → 拒;② 文件 mtime < 2 分钟 → 拒
 * (快照不可得时仅靠 ② 兜底)。文件已不存在视为幂等成功。仅允许 .ts。
 */
export async function deleteRecordingFile(
  anchor: string,
  file: string,
  recordingAnchors: Set<string>,
): Promise<void> {
  assertSafeName(anchor);
  assertSafeName(file);
  if (!file.endsWith(".ts")) throw new Error("只允许删除 .ts 录像文件");
  if (recordingAnchors.has(anchor)) throw new Error("该主播正在录制中,禁止删除其文件");

  const fullPath = path.join(rootDir(), anchor, file);
  let st;
  try {
    st = await fs.stat(fullPath);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return; // 幂等
    throw e;
  }
  if (Date.now() - st.mtimeMs < RECORDING_GRACE_MS) {
    throw new Error("文件 2 分钟内仍在写入(疑似录制中),禁止删除");
  }
  await fs.unlink(fullPath).catch((e) => {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; // 幂等:stat 与 unlink 之间被引擎轮转掉
  });
}
