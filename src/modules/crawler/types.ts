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
  SYNC_DOUYIN_LIVE_ROOMS: "crawler:sync_douyin_live_rooms", // 抖音公会「正在直播」快照（5min，平面图在播+开播时间）
  SYNC_ZHAOHUA_OFFICIAL_REPLAYS: "crawler:sync_zhaohua_official_replays", // 造化仙府官号灵机下播复盘
  SYNC_ZHAOHUA_OFFICIAL_VIDEOS: "crawler:sync_zhaohua_official_videos", // 造化仙府官号创作者中心视频与日汇总
  SYNC_XIAOMOWAN_OFFICIAL_VIDEOS: "crawler:sync_xiaomowan_official_videos", // 小魔丸抖音创作者中心视频与日汇总
  SYNC_WECHAT_AI_COMIC: "crawler:sync_wechat_ai_comic", // 视频号 AI 漫剧作品与日汇总
  SYNC_KUAISHOU_AI_COMIC: "crawler:sync_kuaishou_ai_comic", // 快手 AI 漫剧作品快照
  SYNC_BILIBILI_AI_COMIC: "crawler:sync_bilibili_ai_comic", // B站 AI 漫剧作品快照
  SYNC_XIAOHONGSHU_AI_COMIC: "crawler:sync_xiaohongshu_ai_comic", // 小红书 AI 漫剧作品快照
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
