/** go-recorder WS `builtinTasks` 单条任务(线上 2026-03 构建实测字段,勿增删) */
export interface BuiltinTask {
  platform: string;
  room_id: string;
  anchor_name: string;
  avatar: string;
  quality: string;
  /** 录制中 / 监控中 / 已暂停 / 未开播等待中 / 检测异常等待中 / 断流缓冲中 / 初始化中 */
  status: string;
  update_time: string;
  is_paused: boolean;
  /** 该主播累计录像体积(引擎格式化好的字符串,如 "549.43 GB") */
  file_size: string;
  duration: string;
}

export interface RecorderSnapshot {
  online: boolean;
  tasks: BuiltinTask[];
  /** NAS 剩余空间(bytes);快照未含 systemStatus 时为 null */
  diskFree: number | null;
  fetchedAt: number;
}

/** go-recorder BuiltinConfig(POST 覆盖式,更新前必须 GET 合并) */
export interface RecorderConfig {
  quality: string;
  segment_time: number;
  check_interval: number;
  save_path: string;
}

export interface AnchorFolder {
  name: string;
  fileCount: number;
  totalSize: number;
}

export interface RecordingFile {
  name: string;
  size: number;
  mtimeMs: number;
  /** mtime 距今 < 2 分钟,视为正在写入 */
  recording: boolean;
}

/**
 * 写 action 的判别式返回值。生产 Server Action 里 throw 的 Error 会被 Next
 * 脱敏成通用 digest,UI 拿不到具体原因;改走返回值绕过脱敏,业务错误一律
 * `{ ok: false, error }` 而非向上抛出。
 */
export type ActionResult = { ok: true } | { ok: false; error: string };
