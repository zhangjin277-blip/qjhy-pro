import "server-only";
import type { Page } from "puppeteer-core";
import { CookieExpiredError } from "@/lib/puppeteer";

const ENDPOINT = "/rest/analysis/live/room/today/list";
const PAGE_SIZE = 100;
const REQUEST_DELAY_MS = 200;

/**
 * 快手公会「今日开播直播间」单场原始字段（43 字段）。
 * 来源：POST /rest/analysis/live/room/today/list
 *
 * 跟 history 字段名不同（liveId vs liveStreamId, acu vs validAcu 等），需要做映射。
 * 独有字段（推广 / 画像 / 主播分级）整体丢 today_extra jsonb。
 */
export interface KuaishouTodayLiveRaw {
  // 基础
  memberId: number;
  brokerId: number | null;
  liveId: number;
  memberName: string;
  headImg: string;
  brokerName: string | null;
  fansCnt: number;
  liveType: string; // "game" 英文
  liveTitle: string;
  coverUrl: string;
  liveDetail: string;

  // 时间
  liveDuration: number; // 毫秒
  startTime: number; // 毫秒
  endTime: number;

  // 核心指标（同 history 但字段名不同）
  totalOnlineNum: number; // ~ playUserCnt
  maxOnlineNum: number; // ~ maxConcurrentUserNum
  avgOnlineDuration: number; // ~ perPalyTimeAvgMillis（单位 ms）
  acu: number; // ~ validAcu
  punishCnt: number | null; // ~ reportNum

  // 互动 / 送礼（字段名同 history）
  likeCnt: number;
  commentCnt: number;
  shareCnt: number;
  sendGiftUv: number;
  liveAmt: number;

  // today 独有：推广（8）
  promoteAmt: number | null;
  promoteCost: number;
  promoteRefund: number | null;
  promoteWatchCnt: number;
  promoteGmv: number;
  promoteRoi: number;
  promoteOrderCnt: number | null;
  promoteFansAdd: number;

  // today 独有：粉丝画像（4） / 主播分级（3） / 状态（4）
  fansMostAge: string;
  fansRate: number; // 注意：today 这个字段是粉丝率（数字）≠ history 的 transferFansRate
  fansMaleRate: number;
  fansMostProvince: string;
  authorTypeEnum: string | null;
  authorType: string | null;
  ratio: number | null;
  hasPromote: boolean;
  hasPunish: boolean;
  settleInTime: number;
  settleProvince: string;
}

interface ListResp {
  result: number;
  message?: string;
  data?: { total: number; list: KuaishouTodayLiveRaw[] };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 拉今日所有开播 / 已下播的直播场次（全机构）。
 * today/list 不需要时间参数，默认就是今日。
 */
export async function fetchKuaishouTodayLiveSessions(page: Page): Promise<KuaishouTodayLiveRaw[]> {
  const all: KuaishouTodayLiveRaw[] = [];
  let total = Infinity;

  for (let p = 1; p <= 30; p++) {
    const reqBody = JSON.stringify({
      memberIds: [],
      brokerId: "",
      liveTitle: "",
      orderBy: "totalOnlineNum",
      order: "descending",
      page: p,
      count: PAGE_SIZE,
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
      throw new CookieExpiredError(`today/list auth failed (${status}) on page ${p}`);
    }
    if (!text.startsWith("{")) {
      throw new CookieExpiredError(`today/list non-JSON on page ${p}`);
    }
    const json = JSON.parse(text) as ListResp;
    if (json.result !== 1) {
      throw new Error(`today/list result=${json.result} ${json.message ?? ""}`);
    }
    const list = json.data?.list ?? [];
    total = json.data?.total ?? total;
    console.log(
      `[today-live] page ${p}: got ${list.length} rows (cumulative ${all.length + list.length}/${total})`,
    );
    all.push(...list);
    if (list.length < PAGE_SIZE || all.length >= total) break;
    await sleep(REQUEST_DELAY_MS);
  }

  return all;
}
