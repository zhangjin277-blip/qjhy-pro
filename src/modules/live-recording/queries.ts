import "server-only";
import {
  hasCover,
  listStreamerFolders,
  readCategories,
  readRetention,
  readUrlsFile,
} from "./files";
import {
  listStreamers,
  parsePlatformRoom,
  parseStartTimeMs,
  platformLabel,
  type StreamerEntry,
} from "./urls";

export interface StreamerView extends StreamerEntry {
  platform: string;
  /** 平台中文名 */
  platformName: string;
  roomId: string;
  /** 是否有封面文件 */
  hasCover: boolean;
  /** 该主播是否正在录制 */
  recording: boolean;
  /** 正在录制时的本场时长(秒);未录制为 0 */
  durationSec: number;
  /** 正在录制时的本场文件大小(bytes);未录制为 0 */
  currentSize: number;
  fileCount: number;
  totalSize: number;
  /** 自定义分类名;未分类为 "" */
  category: string;
  /** 录像保存天数;0 = 永久(不自动删除) */
  retentionDays: number;
}

/** 已定义的分类名列表(供筛选与下拉) */
export async function getCategories(): Promise<string[]> {
  return (await readCategories()).categories;
}

/**
 * 录制名单视图:名单条目 + 各主播文件夹活跃度 + 封面 + 平台 + 分类。
 * 过滤掉非直播间的杂项行(无房间号,如 union.bytedance.com 配置行);相同 url 去重。
 * 录像目录读不到时 degrade 为“只显示名单、录制状态未知”。
 */
export async function getStreamerList(): Promise<StreamerView[]> {
  const [content, folders, cat, ret] = await Promise.all([
    readUrlsFile(),
    listStreamerFolders().catch(() => []),
    readCategories(),
    readRetention(),
  ]);
  const byName = new Map(folders.map((f) => [f.name, f]));
  const now = Date.now();

  const seen = new Set<string>();
  const views: StreamerView[] = [];
  for (const e of listStreamers(content)) {
    const { platform, roomId } = parsePlatformRoom(e.url);
    if (!roomId) continue; // 跳过非直播间杂项行(无房间号)
    if (seen.has(e.url)) continue; // 相同 url 去重
    seen.add(e.url);

    const folder = e.name ? byName.get(e.name) : undefined;
    const recording = folder?.recording ?? false;
    let durationSec = 0;
    let currentSize = 0;
    if (recording && folder) {
      currentSize = folder.latestFileSize;
      const startMs = parseStartTimeMs(folder.latestFileName);
      if (startMs) durationSec = Math.max(0, Math.floor((now - startMs) / 1000));
    }

    views.push({
      ...e,
      platform,
      platformName: platformLabel(platform),
      roomId,
      hasCover: platform && roomId ? await hasCover(platform, roomId) : false,
      recording,
      durationSec,
      currentSize,
      fileCount: folder?.fileCount ?? 0,
      totalSize: folder?.totalSize ?? 0,
      category: cat.byUrl[e.url] ?? "",
      retentionDays: ret.byUrl[e.url] ?? 0,
    });
  }
  return views;
}
