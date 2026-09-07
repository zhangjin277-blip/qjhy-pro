import "server-only";
import type { HTTPResponse, Page } from "puppeteer-core";
import { CookieExpiredError } from "@/lib/puppeteer";

const REVIEW_URL = "https://anchor.douyin.com/anchor/review";
const HISTORY_PATH = "/room/replay/history_list";
const RESPONSE_TIMEOUT_MS = 90_000;

export interface LingjiReplayRow {
  roomId: string;
  title: string | null;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
  metrics: Record<string, number | null>;
  baseRaw: Record<string, unknown>;
  overviewRaw: Record<string, unknown>;
  gameRaw: Record<string, unknown>;
  historyRaw: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function unwrapComponent(value: unknown): Record<string, unknown> {
  let current: unknown = value;
  for (let depth = 0; depth < 6; depth++) {
    const record = asRecord(current);
    if (!record) break;
    const data = parseJson(record.data);
    if (data === current || data === undefined) break;
    current = data;
  }
  return asRecord(current) ?? {};
}

function series(value: Record<string, unknown>): Record<string, unknown>[] {
  const data = asRecord(value.data) ?? value;
  return Array.isArray(data.series)
    ? data.series.map(asRecord).filter((row): row is Record<string, unknown> => row !== null)
    : [];
}

function findValue(value: unknown, keys: string[]): unknown {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const queue: unknown[] = [value];
  while (queue.length > 0) {
    const current = queue.shift();
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    const record = asRecord(current);
    if (!record) continue;
    for (const [key, child] of Object.entries(record)) {
      if (wanted.has(key.toLowerCase()) && child !== null && child !== "") return child;
      if (typeof child === "object" && child !== null) queue.push(child);
    }
  }
  return null;
}

function numberValue(value: unknown, keys: string[]): number | null {
  const raw = findValue(value, keys);
  if (raw === null || raw === undefined || raw === "" || raw === "--" || raw === "-") return null;
  const normalized = typeof raw === "string" ? raw.replaceAll(",", "").replace("%", "") : raw;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function textValue(value: unknown, keys: string[]): string | null {
  const raw = findValue(value, keys);
  return raw === null || raw === undefined || raw === "" ? null : String(raw);
}

function dateValue(value: unknown, keys: string[]): Date | null {
  const raw = findValue(value, keys);
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number" || /^\d{10,13}$/.test(String(raw))) {
    const numeric = Number(raw);
    const date = new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const rawText = String(raw);
  const date = new Date(
    rawText.replace(" ", "T") + (/Z$|[+-]\d\d:\d\d$/.test(rawText) ? "" : "+08:00"),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

async function responseJson(response: HTTPResponse): Promise<Record<string, unknown>> {
  if (response.status() === 401 || response.status() === 403) {
    throw new CookieExpiredError(`Lingji auth failed (${response.status()})`);
  }
  if (!response.ok()) throw new Error(`Lingji request failed (${response.status()})`);
  return unwrapComponent(await response.json());
}

function responseFor(page: Page, path: string): Promise<HTTPResponse> {
  return page.waitForResponse((response) => response.url().includes(path), {
    timeout: RESPONSE_TIMEOUT_MS,
  });
}

async function readDisplayMetrics(page: Page): Promise<Record<string, number | null>> {
  return (await page.evaluate(`(() => {
    const lines = (document.body?.innerText ?? "")
      .split("\\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const read = (label, options = {}) => {
      const index = lines.indexOf(label);
      if (index < 0) return null;
      const raw = lines[index + 1];
      if (!raw || raw === "-" || raw === "--") return null;
      const numeric = Number(raw.replaceAll(",", "").replace("%", ""));
      if (!Number.isFinite(numeric)) return null;
      const unit = lines[index + 2];
      if (unit === "万") return Math.round(numeric * 10_000);
      if (options.minutes && unit === "分钟") return Math.round(numeric * 60);
      return numeric;
    };

    return {
      exposureUv: read("曝光人数"),
      enterRoomUv: read("进房人数"),
      enterRoomRate: read("进房率"),
      avgOnline: read("平均在线人数"),
      peakOnline: read("最高在线人数"),
      avgWatchSeconds: read("人均停留时长", { minutes: true }),
      soundWave: read("收获音浪"),
      giftUsers: read("送礼人数"),
      newFollowers: read("新增粉丝"),
      commentUsers: read("评论人数"),
      likeCount: read("点赞次数"),
      shareCount: read("分享次数"),
      fanClubUsers: read("加粉丝团人数"),
      gameRevenue: read("小游戏预估收入"),
      gameActivations: read("小游戏激活人数"),
      gamePurchases: read("小游戏内购人数"),
    };
  })()`)) as Record<string, number | null>;
}

function firstNumber(...values: (number | null | undefined)[]): number | null {
  return values.find((value): value is number => typeof value === "number") ?? null;
}

function metrics(
  overview: unknown,
  game: unknown,
  history: unknown,
  display: Record<string, number | null>,
): Record<string, number | null> {
  const historyAvgMinutes = numberValue(history, ["liveServerWatchDurationTdPavg"]);
  return {
    exposureUv: firstNumber(
      numberValue(overview, ["showUV", "show_uv", "exposureUV", "exposureUv", "show_user_cnt"]),
      display.exposureUv,
    ),
    enterRoomUv: firstNumber(
      numberValue(overview, [
        "watchUV",
        "watch_uv",
        "enterRoomUV",
        "enterRoomUv",
        "enter_user_cnt",
      ]),
      numberValue(history, ["serverWatchUcntTdDirect"]),
      display.enterRoomUv,
    ),
    enterRoomRate: firstNumber(
      numberValue(overview, ["enterRoomRate", "enter_room_rate", "showToWatchRate"]),
      display.enterRoomRate,
    ),
    avgOnline: firstNumber(
      numberValue(overview, ["avgUserCount", "avgOnline", "acu", "averageOnlineUser"]),
      display.avgOnline,
    ),
    peakOnline: firstNumber(
      numberValue(overview, ["maxUserCount", "peakOnline", "maxOnline", "pcu"]),
      display.peakOnline,
    ),
    avgWatchSeconds: firstNumber(
      numberValue(overview, ["avgWatchDuration", "perCapitaWatchDuration", "avg_watch_duration"]),
      historyAvgMinutes === null ? null : Math.round(historyAvgMinutes * 60),
      display.avgWatchSeconds,
    ),
    soundWave: firstNumber(
      numberValue(overview, ["income", "ticketCount", "soundWave", "diamondCount"]),
      numberValue(history, ["roomLiveEarnScore"]),
      display.soundWave,
    ),
    giftUsers: firstNumber(
      numberValue(overview, ["giftUserCount", "giftUsers", "sendGiftUV"]),
      numberValue(history, ["liveConsumeUcnt"]),
      display.giftUsers,
    ),
    newFollowers: firstNumber(
      numberValue(overview, ["newFansCount", "newFollowers", "followUserCount"]),
      numberValue(history, ["liveNewFollowUcnt"]),
      display.newFollowers,
    ),
    commentUsers: firstNumber(
      numberValue(overview, ["commentUserCount", "commentUsers", "commentUV"]),
      numberValue(history, ["clientCommentUcntTd"]),
      display.commentUsers,
    ),
    likeCount: firstNumber(
      numberValue(overview, ["likeCount", "likeCnt", "diggCount"]),
      numberValue(history, ["serverLikeCntTd"]),
      display.likeCount,
    ),
    shareCount: firstNumber(numberValue(overview, ["shareCount", "shareCnt"]), display.shareCount),
    fanClubUsers: firstNumber(
      numberValue(overview, ["fansClubCount", "fanClubUsers", "fansClubUV"]),
      display.fanClubUsers,
    ),
    gameRevenue: firstNumber(
      numberValue(game, ["estimatedRevenue", "estimateIncome", "revenue", "income"]),
      display.gameRevenue,
    ),
    gameActivations: firstNumber(
      numberValue(game, ["activationUV", "activeUserCount", "activeUV", "activateCount"]),
      display.gameActivations,
    ),
    gamePurchases: firstNumber(
      numberValue(game, ["purchaseUV", "payUserCount", "payUV"]),
      display.gamePurchases,
    ),
  };
}

export async function fetchLingjiHistory(
  page: Page,
  fromDate: string,
  toDate: string,
): Promise<Record<string, unknown>[]> {
  const historyResponse = responseFor(page, HISTORY_PATH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: RESPONSE_TIMEOUT_MS });
  const payload = await responseJson(await historyResponse);
  return series(payload).filter((row) => {
    const startedAt = textValue(row, ["startTime", "start_time", "startDate", "start_datetime"]);
    if (!startedAt) return false;
    const day = startedAt.slice(0, 10);
    return day >= fromDate && day <= toDate;
  });
}

export async function fetchLingjiReplay(
  page: Page,
  history: Record<string, unknown>,
): Promise<LingjiReplayRow | null> {
  const roomId = textValue(history, ["roomID", "roomId", "room_id"]);
  if (!roomId) return null;

  const url = new URL(REVIEW_URL);
  url.searchParams.set("roomId", roomId);
  url.searchParams.set("from", "lingji_redirect");
  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: RESPONSE_TIMEOUT_MS });

  const expectedStart = textValue(history, [
    "startTime",
    "start_time",
    "startDate",
    "start_datetime",
  ]);
  await page
    .waitForFunction(
      `(() => {
        const text = document.body?.innerText ?? "";
        return text.includes("平均在线人数") &&
          ${expectedStart ? `text.includes(${JSON.stringify(expectedStart)})` : "true"};
      })()`,
      { timeout: RESPONSE_TIMEOUT_MS },
    )
    .catch((error) => {
      throw new Error(`Lingji replay page did not render for room ${roomId}`, { cause: error });
    });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const displayRaw = await readDisplayMetrics(page);
  const startedAt = dateValue(history, ["startTime", "start_time", "startDate", "start_datetime"]);
  if (!startedAt) return null;
  const endedAt = dateValue(history, ["endTime", "end_time", "endDate", "end_datetime"]);
  const durationSeconds =
    numberValue(history, ["duration", "durationSeconds", "liveDuration", "live_duration"]) ??
    (endedAt ? Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)) : null);
  return {
    roomId,
    title: textValue(history, ["title", "roomTitle", "room_title"]),
    startedAt,
    endedAt,
    durationSeconds,
    metrics: metrics({}, {}, history, displayRaw),
    baseRaw: {},
    overviewRaw: { _display: displayRaw },
    gameRaw: {},
    historyRaw: history,
  };
}
