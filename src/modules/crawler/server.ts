import "server-only";

export { getBoss, stopBoss, enqueue, JOB_NAMES } from "./queue";
export type {
  JobName,
  FetchSimplePayload,
  FetchPerAnchorPayload,
  FetchSessionMgPayload,
  CheckDataReadyPayload,
} from "./types";
export {
  getActiveCookies,
  markCookieExpired,
  saveCookies,
  type Basecamp,
  type CookieRecord,
} from "./cookie";
export { notifyCrawlerError } from "./notify";
export {
  fetchAnchorList,
  parseAnchorListResponse,
  type AnchorProfileRow,
} from "./adapters/anchor-list";
export {
  fetchAnchorDaily,
  parseAnchorDailyResponse,
  type AnchorDailyRow,
} from "./adapters/anchor-daily";
export const MAX_READINESS_ATTEMPTS = 8;
export const READINESS_RETRY_INTERVAL_MS = 30 * 60 * 1000;
export { checkDataReady, runExport, parseCsv } from "./download-helper";
export {
  fetchAllGamePromo,
  parseGamePromoRow,
  type GamePromoRow,
  type GamePromoTaskResult,
  type BizMode,
  type PromoteScene,
} from "./adapters/game-promo";
export {
  fetchMinigameLive,
  parseMinigameRow,
  type MinigameRow,
  type MinigameScene,
} from "./adapters/minigame-live";
export {
  fetchPortraitCoreForAnchor,
  parsePortraitCoreResponse,
  type PortraitRow,
} from "./adapters/portrait-core";
export {
  fetchSessionMinigame,
  parseSessionMinigameResponse,
  type SessionMgRow,
} from "./adapters/session-minigame";
export {
  fetchKuaishouMembers,
  mapKuaishouMember,
  inferProductFromName,
  normalizePersonName,
  type KuaishouMemberRaw,
  type MappedMember,
} from "./adapters/kuaishou-member";
export {
  fetchKuaishouHistoryLiveSessions,
  parseLiveAmt,
  type KuaishouHistoryLiveRaw,
} from "./adapters/kuaishou-history-live";
export {
  fetchKuaishouTodayLiveSessions,
  type KuaishouTodayLiveRaw,
} from "./adapters/kuaishou-today-live";
export {
  fetchKuaishouLiveList,
  fetchKuaishouLiveTrend,
  fetchKuaishouHistoryTrend,
  type KuaishouLiveListRow,
  type KuaishouTrendPoint,
  type KuaishouTrendBundle,
  type KuaishouHistoryTrendPoint,
} from "./adapters/kuaishou-live-baseinfo";
export { fetchVideoListForAnchor, type VideoSnapshotRow } from "./adapters/video-list";
export { resolveOfflineOpAnchors, type OfflineOpAnchor } from "./offline-op-anchors";
