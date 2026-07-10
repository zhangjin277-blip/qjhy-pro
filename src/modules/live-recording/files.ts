import "server-only";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * 录像目录(downloads)与名单文件(builtin_urls.txt)的文件系统读写。
 *
 * 环境变量:
 *   RECORDINGS_DIR  录像根目录(生产 = 挂载卷 /mnt/recordings;本地开发指测试目录)
 *   URLS_FILE       名单文件路径(生产 = 挂载的 builtin_urls.txt;本地开发指测试文件)
 *
 * 结构:<RECORDINGS_DIR>/<主播名>/<主播名>_<日期>_<时间>.ts  (+ 可能有 Screenshots/ 等子目录)
 * 只认 .ts 文件,忽略子目录和其他文件。
 */

/** 最新 .ts 文件修改时间在此窗口内 → 视为“正在录制” / 禁止删除 */
const RECORDING_WINDOW_MS = 2 * 60 * 1000;

export interface StreamerFolder {
  name: string;
  fileCount: number;
  totalSize: number;
  latestMtimeMs: number;
  recording: boolean;
}

export interface RecordingFile {
  name: string;
  size: number;
  mtimeMs: number;
  recording: boolean;
}

function recordingsRoot(): string {
  const d = process.env.RECORDINGS_DIR;
  if (!d) throw new Error("RECORDINGS_DIR 未配置");
  return d;
}

function urlsFilePath(): string {
  const f = process.env.URLS_FILE;
  if (!f) throw new Error("URLS_FILE 未配置");
  return f;
}

/** 单层文件名安全校验:禁止路径穿越 */
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

/** 列主播文件夹(按总大小降序);统计只算 .ts */
export async function listStreamerFolders(): Promise<StreamerFolder[]> {
  const root = recordingsRoot();
  const dirents = await fs.readdir(root, { withFileTypes: true });
  const now = Date.now();
  const out: StreamerFolder[] = [];
  for (const d of dirents) {
    if (!d.isDirectory()) continue;
    const dir = path.join(root, d.name);
    let fileCount = 0;
    let totalSize = 0;
    let latestMtimeMs = 0;
    const files = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith(".ts")) continue;
      const st = await fs.stat(path.join(dir, f.name)).catch(() => null);
      if (!st) continue;
      fileCount += 1;
      totalSize += st.size;
      if (st.mtimeMs > latestMtimeMs) latestMtimeMs = st.mtimeMs;
    }
    out.push({
      name: d.name,
      fileCount,
      totalSize,
      latestMtimeMs,
      recording: latestMtimeMs > 0 && now - latestMtimeMs < RECORDING_WINDOW_MS,
    });
  }
  return out.sort((a, b) => b.totalSize - a.totalSize);
}

/** 列某主播的录像文件(按 mtime 降序;只 .ts) */
export async function listFiles(streamer: string): Promise<RecordingFile[]> {
  assertSafeName(streamer);
  const dir = path.join(recordingsRoot(), streamer);
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const now = Date.now();
  const out: RecordingFile[] = [];
  for (const f of dirents) {
    if (!f.isFile() || !f.name.endsWith(".ts")) continue;
    const st = await fs.stat(path.join(dir, f.name)).catch(() => null);
    if (!st) continue;
    out.push({
      name: f.name,
      size: st.size,
      mtimeMs: st.mtimeMs,
      recording: now - st.mtimeMs < RECORDING_WINDOW_MS,
    });
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/** 下载/预览用:校验并返回文件大小与绝对路径 */
export async function statRecording(
  streamer: string,
  file: string,
): Promise<{ size: number; fullPath: string }> {
  assertSafeName(streamer);
  assertSafeName(file);
  if (!file.endsWith(".ts")) throw new Error("只允许 .ts 文件");
  const fullPath = path.join(recordingsRoot(), streamer, file);
  const st = await fs.stat(fullPath);
  if (!st.isFile()) throw new Error("不是文件");
  return { size: st.size, fullPath };
}

/** 流式读取(支持 range) */
export function getReadStream(
  fullPath: string,
  range?: { start: number; end: number },
): NodeJS.ReadableStream {
  return createReadStream(fullPath, range);
}

/**
 * 物理删除录像。保护:最新修改在 2 分钟内(疑似正在写)→ 拒绝。
 * 文件已不存在视为幂等成功。只允许 .ts。
 */
export async function deleteRecording(streamer: string, file: string): Promise<void> {
  assertSafeName(streamer);
  assertSafeName(file);
  if (!file.endsWith(".ts")) throw new Error("只允许删除 .ts 录像文件");
  const fullPath = path.join(recordingsRoot(), streamer, file);
  let st;
  try {
    st = await fs.stat(fullPath);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
    throw e;
  }
  if (Date.now() - st.mtimeMs < RECORDING_WINDOW_MS) {
    throw new Error("该文件 2 分钟内仍在写入(疑似正在录制),禁止删除");
  }
  await fs.unlink(fullPath).catch((e: NodeJS.ErrnoException) => {
    if (e.code !== "ENOENT") throw e;
  });
}

/** 读名单文件内容(不存在返回空串) */
export async function readUrlsFile(): Promise<string> {
  return fs.readFile(urlsFilePath(), "utf8").catch((e: NodeJS.ErrnoException) => {
    if (e.code === "ENOENT") return "";
    throw e;
  });
}

/**
 * 原子写名单文件(临时文件 + rename),尽量减小与 go-recorder 写回的竞态窗口。
 */
export async function writeUrlsFile(content: string): Promise<void> {
  const target = urlsFilePath();
  const tmp = `${target}.qjhy-tmp-${process.pid}`;
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, target);
}
