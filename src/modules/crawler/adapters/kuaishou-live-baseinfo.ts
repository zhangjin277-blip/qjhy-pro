import "server-only";
import { CookieExpiredError } from "@/lib/puppeteer";

const JIGOU_BASE = "https://jigou.kuaishou.com";
const SIX_BASE = "https://666.kuaishou.com";
const LIST_ENDPOINT = "/rest/cp/org/live/list";
const TREND_ENDPOINT = "/rest/live/mcn/live/monitor/trend";

/** /rest/cp/org/live/list 返回的单条 — 含我们要的所有 ID + 当前累计 income */
export interface KuaishouLiveListRow {
  memberId: number;
  memberName: string;
  /** 数字 ID（jigou 接口用） */
  liveStreamId: number;
  /** 字符串 ID（666 接口用，从 liveStreamUrl 正则提取） */
  streamLiveIdStr: string;
}

/** /rest/live/mcn/live/monitor/trend 返回的单条分时点 */
export interface KuaishouTrendPoint {
  time: number; // 毫秒
  value: number; // 单位看 trendName：SUM_VALID_INCOME 是元（小数）；其它是计数
}

/** 666 trend 接口完整返回（5 个 trendName） */
export interface KuaishouTrendBundle {
  validIncome: KuaishouTrendPoint[]; // SUM_VALID_INCOME（元，累计）
  onlineCount: KuaishouTrendPoint[]; // ONLINE_COUNT（当下值，非累计）
  bulletCount: KuaishouTrendPoint[]; // SUM_BULLET_SCREEN_COUNT（累计）
  likeCount: KuaishouTrendPoint[]; // SUM_LIKE_COUNT（累计）
  shareCount: KuaishouTrendPoint[]; // SUM_SHARE_COUNT（累计）
}

interface RawListItem {
  liveStreamId: number;
  liveStreamUrl?: string;
  userInfo?: { userId: number; userName: string };
}

interface ListResp {
  result: number;
  error_msg?: string;
  data?: { list?: RawListItem[] };
}

interface TrendResp {
  result: number;
  error_msg?: string;
  message?: string;
  data?: {
    trends?: {
      trendIndex: number;
      trendName: string;
      trendData: KuaishouTrendPoint[];
    }[];
  };
}

function buildCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function getApiPh(cookies: Record<string, string>): string {
  return cookies["kuaishou.web.cp.api_ph"] ?? "";
}

function detectAuthFail(result: number, msg: string | undefined): boolean {
  if (result === 109 || result === 100000010) return true;
  if (!msg) return false;
  return /登录|未授权|未登录|过期|token/i.test(msg);
}

/**
 * 通用 POST：纯 Node fetch + Cookie header。
 * jigou + 666 两个域名都不需要前端签名，cookie 共用。
 */
async function ksPost<T>(opts: {
  baseUrl: string;
  endpoint: string;
  payload: Record<string, unknown>;
  cookies: Record<string, string>;
  /** 666 接口要带这个 */
  extraHeaders?: Record<string, string>;
  /** 是否往 body 加 api_ph（jigou 必带；666 看起来不需要但带也无害） */
  withApiPhBody?: boolean;
}): Promise<T> {
  const { baseUrl, endpoint, payload, cookies, extraHeaders, withApiPhBody } = opts;
  const apiPh = getApiPh(cookies);
  const bodyObj = withApiPhBody ? { ...payload, "kuaishou.web.cp.api_ph": apiPh } : payload;
  const body = JSON.stringify(bodyObj);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(baseUrl + endpoint, {
      method: "POST",
      headers: {
        Cookie: buildCookieHeader(cookies),
        "Content-Type": "application/json",
        Referer: `${baseUrl}/`,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
        ...(extraHeaders ?? {}),
      },
      body,
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }

  if (res.status === 401 || res.status === 403) {
    throw new CookieExpiredError(`${endpoint} auth failed (${res.status})`);
  }
  const text = await res.text();
  if (!text.startsWith("{")) {
    throw new CookieExpiredError(`${endpoint} non-JSON (likely redirected to login)`);
  }
  return JSON.parse(text) as T;
}

/**
 * 从 liveStreamUrl 提取字符串 ID（666 trend 接口用）。
 * URL 形如：https://...gifshow/{streamId}_{type}.m3u8?...
 *   - {streamId} 可能本身含下划线，如「klLHvUy_x0w」
 *   - {type} 是单段英文，如「GameAvcSdL0」
 * 策略：先抓 gifshow/...m3u8 之间的整段，再去掉最后一个下划线及其后内容（即 _{type}）。
 * 例：gifshow/ZM40gx3RvFw_GameAvcSdL0.m3u8 → "ZM40gx3RvFw"
 * 例：gifshow/klLHvUy_x0w_GameAvcSdL0.m3u8 → "klLHvUy_x0w"
 */
function extractStreamLiveIdStr(liveStreamUrl: string | undefined | null): string | null {
  if (!liveStreamUrl) return null;
  const m = liveStreamUrl.match(/gifshow\/([^/?]+?)\.m3u8/);
  if (!m) return null;
  const full = m[1] ?? "";
  const idx = full.lastIndexOf("_");
  return idx > 0 ? full.slice(0, idx) : full;
}

/** jigou: 拉当前在播直播间列表（含字符串 streamLiveId） */
export async function fetchKuaishouLiveList(
  cookies: Record<string, string>,
): Promise<KuaishouLiveListRow[]> {
  const json = await ksPost<ListResp>({
    baseUrl: JIGOU_BASE,
    endpoint: LIST_ENDPOINT,
    payload: { page: 1, count: 100 },
    cookies,
    withApiPhBody: true,
  });
  if (json.result !== 1) {
    if (detectAuthFail(json.result, json.error_msg)) {
      throw new CookieExpiredError(
        `live/list cookie expired: result=${json.result} msg=${json.error_msg ?? ""}`,
      );
    }
    throw new Error(`live/list result=${json.result} ${json.error_msg ?? ""}`);
  }
  const list = json.data?.list ?? [];
  const rows: KuaishouLiveListRow[] = [];
  for (const item of list) {
    if (!item.userInfo?.userId || !item.liveStreamId) continue;
    const streamLiveIdStr = extractStreamLiveIdStr(item.liveStreamUrl);
    if (!streamLiveIdStr) continue; // 没字符串 ID 没法调 666 trend
    rows.push({
      memberId: item.userInfo.userId,
      memberName: item.userInfo.userName ?? "",
      liveStreamId: item.liveStreamId,
      streamLiveIdStr,
    });
  }
  return rows;
}

/** 666: 拉一场直播的累计分时（1 分钟一点，整场全部） */
export async function fetchKuaishouLiveTrend(
  cookies: Record<string, string>,
  streamLiveIdStr: string,
): Promise<KuaishouTrendBundle | null> {
  let json: TrendResp;
  try {
    json = await ksPost<TrendResp>({
      baseUrl: SIX_BASE,
      endpoint: TREND_ENDPOINT,
      payload: { liveStreamId: streamLiveIdStr },
      cookies,
      extraHeaders: { platform: "liveMcn" },
    });
  } catch (e) {
    if (e instanceof CookieExpiredError) throw e;
    console.warn(`[ks-trend] fetch error ${streamLiveIdStr}:`, (e as Error).message);
    return null;
  }
  if (json.result !== 1) {
    if (detectAuthFail(json.result, json.error_msg ?? json.message)) {
      throw new CookieExpiredError(
        `trend cookie expired: result=${json.result} msg=${json.error_msg ?? json.message ?? ""}`,
      );
    }
    console.warn(`[ks-trend] ${streamLiveIdStr} result=${json.result}`);
    return null;
  }
  const trends = json.data?.trends ?? [];
  const out: KuaishouTrendBundle = {
    validIncome: [],
    onlineCount: [],
    bulletCount: [],
    likeCount: [],
    shareCount: [],
  };
  for (const t of trends) {
    switch (t.trendName) {
      case "SUM_VALID_INCOME":
        out.validIncome = t.trendData ?? [];
        break;
      case "ONLINE_COUNT":
        out.onlineCount = t.trendData ?? [];
        break;
      case "SUM_BULLET_SCREEN_COUNT":
        out.bulletCount = t.trendData ?? [];
        break;
      case "SUM_LIKE_COUNT":
        out.likeCount = t.trendData ?? [];
        break;
      case "SUM_SHARE_COUNT":
        out.shareCount = t.trendData ?? [];
        break;
    }
  }
  return out;
}
