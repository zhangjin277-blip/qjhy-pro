import "server-only";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { listStreamers } from "./urls";

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

/** 最新录像文件修改时间在此窗口内 → 视为“正在录制” / 禁止删除 */
const RECORDING_WINDOW_MS = 2 * 60 * 1000;

/**
 * 录像文件扩展名白名单。go-recorder 录制中为 .ts,录完转封装为 .mp4;
 * 兼容其他常见容器。判断/列表/下载/删除都以此为准。
 */
const VIDEO_EXTS = [".ts", ".mp4", ".flv", ".mkv", ".mov"];
function isVideoFile(name: string): boolean {
  const lower = name.toLowerCase();
  return VIDEO_EXTS.some((e) => lower.endsWith(e));
}

export interface StreamerFolder {
  name: string;
  fileCount: number;
  totalSize: number;
  latestMtimeMs: number;
  recording: boolean;
  /** 最新一个 .ts 文件名(正在录制时即当前场次文件),用于算时长;无则 "" */
  latestFileName: string;
  /** 最新一个 .ts 文件大小 */
  latestFileSize: number;
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
    let latestFileName = "";
    let latestFileSize = 0;
    const files = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const f of files) {
      if (!f.isFile() || !isVideoFile(f.name)) continue;
      const st = await fs.stat(path.join(dir, f.name)).catch(() => null);
      if (!st) continue;
      fileCount += 1;
      totalSize += st.size;
      if (st.mtimeMs > latestMtimeMs) {
        latestMtimeMs = st.mtimeMs;
        latestFileName = f.name;
        latestFileSize = st.size;
      }
    }
    out.push({
      name: d.name,
      fileCount,
      totalSize,
      latestMtimeMs,
      recording: latestMtimeMs > 0 && now - latestMtimeMs < RECORDING_WINDOW_MS,
      latestFileName,
      latestFileSize,
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
    if (!f.isFile() || !isVideoFile(f.name)) continue;
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
  if (!isVideoFile(file)) throw new Error("不支持的文件类型");
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
  if (!isVideoFile(file)) throw new Error("只允许删除录像文件");
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
 * 就地覆写名单文件。
 * 注意:builtin_urls.txt 通常以「单文件 bind mount」挂进容器,rename 到挂载点会 EBUSY,
 * 所以不能用 tmp+rename 的原子写法,只能就地覆写(go-recorder 本身也是就地读写此文件)。
 * 小文本单次 writeFile,与 go-recorder 3 秒热重载的竞态窗口极小,可接受。
 */
export async function writeUrlsFile(content: string): Promise<void> {
  await fs.writeFile(urlsFilePath(), content, "utf8");
}

/**
 * 封面图:go-recorder 存在 COVERS_DIR 下,命名 `{平台}_{房间号}.jpg`。
 * 校验平台(白名单)与房间号(纯数字)防穿越;不存在则抛错(路由回 404 → 前端显占位)。
 */
export async function statCover(
  platform: string,
  roomId: string,
): Promise<{ fullPath: string; size: number }> {
  const dir = process.env.COVERS_DIR;
  if (!dir) throw new Error("COVERS_DIR 未配置");
  if (!["Douyin", "Kuaishou", "Soop"].includes(platform)) throw new Error("非法平台");
  if (!/^\d+$/.test(roomId)) throw new Error("非法房间号");
  const fullPath = path.join(dir, `${platform}_${roomId}.jpg`);
  const st = await fs.stat(fullPath);
  if (!st.isFile()) throw new Error("不是文件");
  return { fullPath, size: st.size };
}

/** 该主播是否有封面文件(名单页决定显缩略图还是占位) */
export async function hasCover(platform: string, roomId: string): Promise<boolean> {
  return statCover(platform, roomId).then(
    () => true,
    () => false,
  );
}

// ---------------- 分类(自定义,存 JSON 边车文件)----------------

/** 分类数据:自定义分类名列表 + 主播url→分类名 的归属。 */
export interface CategoryData {
  categories: string[];
  byUrl: Record<string, string>;
}

/** 分类文件路径:默认放在录像根目录下的隐藏文件(不影响 go-recorder,dir 扫描会跳过非目录)。 */
function categoriesFilePath(): string {
  return process.env.CATEGORIES_FILE ?? path.join(recordingsRoot(), ".qjhy-categories.json");
}

/** 读分类(文件不存在/损坏都返回空,不崩)。 */
export async function readCategories(): Promise<CategoryData> {
  try {
    const raw = await fs.readFile(categoriesFilePath(), "utf8");
    const data = JSON.parse(raw) as Partial<CategoryData>;
    return {
      categories: Array.isArray(data.categories)
        ? data.categories.filter((c) => typeof c === "string")
        : [],
      byUrl:
        data.byUrl && typeof data.byUrl === "object" ? (data.byUrl as Record<string, string>) : {},
    };
  } catch {
    return { categories: [], byUrl: {} };
  }
}

/** 写分类(就地覆写,普通文件无 bind mount 竞态)。 */
export async function writeCategories(data: CategoryData): Promise<void> {
  await fs.writeFile(categoriesFilePath(), JSON.stringify(data, null, 2), "utf8");
}

// ---------------- 保存时长 / 自动清理(存 JSON 边车文件)----------------

/** 保存时长数据:主播 url → 保存天数。0 或缺失 = 永久(不自动删除)。 */
export interface RetentionData {
  byUrl: Record<string, number>;
}

/** 保存时长文件路径:同分类,放录像根目录下的隐藏文件。 */
function retentionFilePath(): string {
  return process.env.RETENTION_FILE ?? path.join(recordingsRoot(), ".qjhy-retention.json");
}

/** 读保存时长(不存在/损坏都返回空,不崩)。 */
export async function readRetention(): Promise<RetentionData> {
  try {
    const raw = await fs.readFile(retentionFilePath(), "utf8");
    const data = JSON.parse(raw) as Partial<RetentionData>;
    const byUrl: Record<string, number> = {};
    if (data.byUrl && typeof data.byUrl === "object") {
      for (const [k, v] of Object.entries(data.byUrl)) {
        if (typeof v === "number" && Number.isFinite(v) && v > 0) byUrl[k] = Math.floor(v);
      }
    }
    return { byUrl };
  } catch {
    return { byUrl: {} };
  }
}

/** 写保存时长(就地覆写)。 */
export async function writeRetention(data: RetentionData): Promise<void> {
  await fs.writeFile(retentionFilePath(), JSON.stringify(data, null, 2), "utf8");
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SweepResult {
  deleted: number;
  freedBytes: number;
  items: { streamer: string; file: string; ageDays: number }[];
}

/**
 * 保存时长自动清理:遍历名单,对设置了有限保存天数的主播,删除其文件夹里
 * mtime 超过保存天数的录像。定位链与名单页一致(url → 主播名 → 文件夹);
 * 无主播名(文件夹无法定位)或永久(天数 <=0)跳过;2 分钟内在写的文件复用录制保护跳过。
 * 幂等、只读磁盘再删,单文件失败不影响其他;由 worker 每小时 cron 调用。
 */
export async function sweepRetention(): Promise<SweepResult> {
  const root = recordingsRoot();
  const [content, ret] = await Promise.all([readUrlsFile(), readRetention()]);
  const now = Date.now();
  const result: SweepResult = { deleted: 0, freedBytes: 0, items: [] };

  for (const e of listStreamers(content)) {
    const days = ret.byUrl[e.url] ?? 0;
    if (days <= 0) continue; // 永久
    if (!e.name) continue; // 无主播名无法定位文件夹
    // 主播名必须是单层安全目录(防穿越,和 assertSafeName 同口径)
    if (e.name.includes("/") || e.name.includes("\\") || e.name.includes("..")) continue;
    const dir = path.join(root, e.name);
    const dirents = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    const cutoff = days * DAY_MS;
    for (const f of dirents) {
      if (!f.isFile() || !isVideoFile(f.name)) continue;
      const full = path.join(dir, f.name);
      const st = await fs.stat(full).catch(() => null);
      if (!st) continue;
      const age = now - st.mtimeMs;
      if (age < RECORDING_WINDOW_MS) continue; // 疑似正在写
      if (age <= cutoff) continue; // 未到期
      const size = st.size;
      try {
        await fs.unlink(full);
        result.deleted += 1;
        result.freedBytes += size;
        result.items.push({ streamer: e.name, file: f.name, ageDays: Math.floor(age / DAY_MS) });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          console.error(`[retention] 删除失败 ${full}:`, err);
        }
      }
    }
  }
  return result;
}
