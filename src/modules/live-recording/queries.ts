import "server-only";
import { listStreamerFolders, readUrlsFile } from "./files";
import { listStreamers, type StreamerEntry } from "./urls";

export interface StreamerView extends StreamerEntry {
  /** 该主播是否正在录制(其文件夹最新 .ts 在 2 分钟内有写入) */
  recording: boolean;
  fileCount: number;
  totalSize: number;
}

/**
 * 录制名单视图:名单文件里的主播条目 + 各自文件夹的录制活跃度。
 * 录像目录读不到(未配置/挂载缺失)时,degrade 为“只显示名单、录制状态未知”。
 */
export async function getStreamerList(): Promise<StreamerView[]> {
  const [content, folders] = await Promise.all([
    readUrlsFile(),
    listStreamerFolders().catch(() => []),
  ]);
  const entries = listStreamers(content);
  const byName = new Map(folders.map((f) => [f.name, f]));
  return entries.map((e) => {
    const folder = e.name ? byName.get(e.name) : undefined;
    return {
      ...e,
      recording: folder?.recording ?? false,
      fileCount: folder?.fileCount ?? 0,
      totalSize: folder?.totalSize ?? 0,
    };
  });
}
