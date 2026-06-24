export const JOB_NAMES = {
  CHECK_DATA_READY: "crawler:check_data_ready",
  FETCH_PROFILE: "crawler:fetch_profile",
  FETCH_DAILY: "crawler:fetch_daily",
  FETCH_GAME: "crawler:fetch_game", // per anchor
  FETCH_MINIGAME: "crawler:fetch_minigame", // per anchor
  FETCH_PORTRAIT: "crawler:fetch_portrait", // per anchor
  FETCH_SESSION_MG: "crawler:fetch_session_mg", // per room_id
  SYNC_KUAISHOU_MEMBERS: "crawler:sync_kuaishou_members", // 快手机构成员同步（live_account 字段对齐）
  SYNC_KUAISHOU_HISTORY_LIVE: "crawler:sync_kuaishou_history_live", // 快手历史直播数据
  SYNC_KUAISHOU_TODAY_LIVE: "crawler:sync_kuaishou_today_live", // 快手今日实时直播数据
  SYNC_KUAISHOU_LIVE_SNAPSHOT: "crawler:sync_kuaishou_live_snapshot", // 快手在播 baseinfo 1 分钟级 snapshot
  BACKFILL_KUAISHOU_TREND: "crawler:backfill_kuaishou_trend", // 快手历史流水分时回补（断档期补礼物数据）
  FETCH_VIDEO: "crawler:fetch_video", // 抖音线下运营组主播视频作品快照（每天 12:00）
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export interface FetchPerAnchorPayload {
  anchor_id: string;
  date: string; // YYYY-MM-DD
  basecamp: "cs" | "nc1" | "nc2";
}

export interface FetchSessionMgPayload {
  room_id: string;
  anchor_id: string;
  basecamp: "cs" | "nc1" | "nc2";
}

export interface FetchSimplePayload {
  date: string;
  basecamp: "cs" | "nc1" | "nc2";
}

export interface CheckDataReadyPayload {
  date: string;
  basecamp: "cs" | "nc1" | "nc2";
  attempt: number; // 1..8
}
