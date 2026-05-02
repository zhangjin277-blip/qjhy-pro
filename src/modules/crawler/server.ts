import "server-only";

export { getBoss, stopBoss, enqueue, JOB_NAMES } from "./queue";
export type {
  JobName,
  FetchSimplePayload,
  FetchPerAnchorPayload,
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
  ANCHOR_DAILY_FIELDS,
  type AnchorDailyRow,
  type ParsedDailyInner,
} from "./adapters/anchor-daily";
export {
  isDailyReady,
  READINESS_THRESHOLD,
  MAX_READINESS_ATTEMPTS,
  READINESS_RETRY_INTERVAL_MS,
} from "./readiness";
export {
  fetchGamePromoForAnchor,
  parseGamePromoResponse,
  type GamePromoRow,
  type BizMode,
  type PromoteScene,
} from "./adapters/game-promo";
export {
  fetchMinigameLiveForAnchor,
  parseMinigameLiveResponse,
  type MinigameRow,
} from "./adapters/minigame-live";
export { fetchMinigameVideoForAnchor, parseMinigameVideoResponse } from "./adapters/minigame-video";
