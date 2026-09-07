import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HTTPResponse, Page } from "puppeteer-core";
import {
  fetchLingjiHistory,
  fetchLingjiReplay,
} from "@/modules/crawler/adapters/zhaohua-official-replay";

function response(url: string, body: unknown): HTTPResponse {
  return {
    url: () => url,
    status: () => 200,
    ok: () => true,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as HTTPResponse;
}

const displayMetrics: Record<string, number | null> = {
  exposureUv: null,
  enterRoomUv: null,
  enterRoomRate: null,
  avgOnline: null,
  peakOnline: null,
  avgWatchSeconds: null,
  soundWave: null,
  giftUsers: null,
  newFollowers: null,
  commentUsers: null,
  likeCount: null,
  shareCount: null,
  fanClubUsers: null,
  gameRevenue: null,
  gameActivations: null,
  gamePurchases: null,
};

function mockPage(responses: HTTPResponse[], display = displayMetrics): Page {
  return {
    waitForResponse: vi.fn().mockImplementation((predicate: (value: HTTPResponse) => boolean) => {
      const match = responses.find(predicate);
      if (!match) throw new Error("Missing mocked response");
      return Promise.resolve(match);
    }),
    reload: vi.fn().mockResolvedValue(null),
    goto: vi.fn().mockResolvedValue(null),
    waitForFunction: vi.fn().mockResolvedValue(null),
    evaluate: vi.fn().mockResolvedValue(display),
  } as unknown as Page;
}

describe("zhaohua official replay adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listens for the signed history response and filters the requested dates", async () => {
    const historyResponse = response("https://anchor.douyin.com/room/replay/history_list", {
      data: JSON.stringify({
        data: {
          series: [
            { roomID: "room-1", startTime: "2026-08-18 12:00:00" },
            { roomID: "room-2", startTime: "2026-08-17 12:00:00" },
          ],
        },
      }),
    });
    const page = mockPage([historyResponse]);

    await expect(fetchLingjiHistory(page, "2026-08-18", "2026-08-19")).resolves.toEqual([
      { roomID: "room-1", startTime: "2026-08-18 12:00:00" },
    ]);
    expect(page.reload).toHaveBeenCalledWith({ waitUntil: "domcontentloaded", timeout: 90_000 });
  });

  it("opens the room URL and maps history plus displayed metrics", async () => {
    const page = mockPage([], {
      ...displayMetrics,
      exposureUv: 12345,
      enterRoomRate: 3.7,
      avgOnline: 20,
      peakOnline: 58,
      shareCount: 6,
      fanClubUsers: 4,
      gameRevenue: 12.5,
      gameActivations: 33,
      gamePurchases: 2,
    });

    const replay = await fetchLingjiReplay(page, {
      roomID: "room-1",
      roomTitle: "测试场次",
      startTime: 1_776_504_360,
      endTime: 1_776_508_560,
      serverWatchUcntTdDirect: "456",
      liveServerWatchDurationTdPavg: "0.5",
      roomLiveEarnScore: "99",
      liveConsumeUcnt: "7",
      liveNewFollowUcnt: "8",
      clientCommentUcntTd: "9",
      serverLikeCntTd: "1000",
    });

    expect(page.goto).toHaveBeenCalledWith(
      "https://anchor.douyin.com/anchor/review?roomId=room-1&from=lingji_redirect",
      { waitUntil: "domcontentloaded", timeout: 90_000 },
    );
    expect(replay).toMatchObject({
      roomId: "room-1",
      title: "测试场次",
      durationSeconds: 4200,
      metrics: {
        exposureUv: 12345,
        enterRoomUv: 456,
        enterRoomRate: 3.7,
        avgOnline: 20,
        peakOnline: 58,
        avgWatchSeconds: 30,
        soundWave: 99,
        giftUsers: 7,
        newFollowers: 8,
        commentUsers: 9,
        likeCount: 1000,
        shareCount: 6,
        fanClubUsers: 4,
        gameRevenue: 12.5,
        gameActivations: 33,
        gamePurchases: 2,
      },
    });
  });
});
