import "server-only";
import type { Page } from "puppeteer-core";
import { CookieExpiredError } from "@/lib/puppeteer";

const ENDPOINT = "/rest/analysis/live/room/history/list";
const PAGE_SIZE = 100;
const REQUEST_DELAY_MS = 200;

/**
 * 快手公会「历史开播直播间」单场原始字段（73 字段）。
 * 来源：POST /rest/analysis/live/room/history/list
 *
 * 注：单场粒度下永远为 0 的累计字段（time / liveDay / liveCnt 等）保留在 raw，不提为列。
 */
export interface KuaishouHistoryLiveRaw {
  // 基础
  liveStreamId: number;
  memberId: number;
  memberName: string;
  headImg: string;
  brokerId: number | null;
  brokerName: string | null;
  fansCnt: number;
  liveType: string; // "游戏" 中文
  title: string;
  coverUrl: string;
  liveDetail: string;

  // 时间
  startDatetime: string; // "2026-05-05 18:01:01"
  endDatetime: string;
  liveDuration: string; // "11小时8分钟"
  liveDurationMillis: number;

  // 流量
  playUv: number;
  playUserCnt: number;
  playUserNum: number;
  maxConcurrentUserNum: number;
  validAcu: number;
  playRate: string; // "31.45%"
  perPalyTimeAvg: string; // "6分钟49秒"
  perPalyTimeAvgMillis: number;
  validPlayDurationAvg: string;
  validPlayDurationAvgMillis: number;
  validPlayDuration: string | null;
  validPlayDurationMillis: number;
  liveCoverCtr: string | null;

  // 涨粉
  addFansCnt: number;
  newFansCnt: number;
  followAuthorNum: number;
  cancelFollowAuthorNum: number;
  transferFansRate: string;
  addFansRate: string | null;
  fansClubCnt: number;
  addFansClubCnt: number;

  // 互动
  likeCnt: number;
  likeRate: string;
  likeUv: number;
  commentCnt: number;
  commentRate: string;
  commentUv: number;
  shareCnt: number;
  shareRate: string;
  shareUv: number;
  interactNum: number;
  interactRate: string | null;

  // 送礼营收
  sendGiftUv: number;
  sentGiftCnt: number;
  liveAmt: string | number; // history 返回 "9,166.800" 字符串带千分位
  liveVideoAmt: number | null;
  liveChatRoomAmt: number | null;

  // 违规
  reportNum: number;
  reportRate: string | null;

  // 其他（保留 raw）
  goodsShowStatus: number;
  detailFansCnt: number;
  detailNewFansCnt: number;
  // ...商品 / 累计统计字段（单场粒度全 0）
}

interface ListResp {
  result: number;
  message?: string;
  data?: { total: number; list: KuaishouHistoryLiveRaw[] };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 拉指定时间窗口内全机构所有「已下播」直播场次，分页全拉。
 *
 * @param startTimeMs 开始时间戳（ms，含）
 * @param endTimeMs 结束时间戳（ms，含）
 */
export async function fetchKuaishouHistoryLiveSessions(
  page: Page,
  startTimeMs: number,
  endTimeMs: number,
): Promise<KuaishouHistoryLiveRaw[]> {
  const all: KuaishouHistoryLiveRaw[] = [];
  let total = Infinity;

  for (let p = 1; p <= 100; p++) {
    const reqBody = JSON.stringify({
      memberIds: [],
      liveTitle: "",
      settleInTime: 0,
      startTime: startTimeMs,
      endTime: endTimeMs,
      orderBy: "startDatetime",
      order: "descending",
      page: p,
      count: PAGE_SIZE,
      agreementType: [-1],
      memberLifeCycle: [-1],
      brokerId: null,
    });

    const { status, text } = await page.evaluate(
      async (endpoint: string, body: string) => {
        const res = await fetch(endpoint, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json", accept: "application/json" },
          body,
        });
        return { status: res.status, text: await res.text() };
      },
      ENDPOINT,
      reqBody,
    );

    if (status === 401 || status === 403) {
      throw new CookieExpiredError(`history/list auth failed (${status}) on page ${p}`);
    }
    if (!text.startsWith("{")) {
      throw new CookieExpiredError(`history/list non-JSON on page ${p}`);
    }
    const json = JSON.parse(text) as ListResp;
    if (json.result !== 1) {
      throw new Error(`history/list result=${json.result} ${json.message ?? ""}`);
    }
    const list = json.data?.list ?? [];
    total = json.data?.total ?? total;
    console.log(
      `[history-live] page ${p}: got ${list.length} rows (cumulative ${all.length + list.length}/${total})`,
    );
    all.push(...list);
    if (list.length < PAGE_SIZE || all.length >= total) break;
    await sleep(REQUEST_DELAY_MS);
  }

  return all;
}

/** 解析 "9,166.800" → 9166.8 */
export function parseLiveAmt(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  const cleaned = v.replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
