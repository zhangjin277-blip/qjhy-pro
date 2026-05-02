import "server-only";
import type { Page } from "puppeteer-core";
import { pageFetch } from "@/lib/puppeteer";

const OVERVIEW =
  "https://union.bytedance.com/ark_api_tinker_proxy/lego/native/webcast_api/room/replay/overview_v3";
const AUDIENCE_CONVERT =
  "https://union.bytedance.com/ark_api_tinker_proxy/lego/native/webcast_api/room/minigame/audience_convert";

export interface SessionMgRow {
  room_id: string;
  anchor_id: string;
  date: string;
  acu: number | null;
  show_uv: number | null;
  not_open_game_uv: number | null;
  not_open_game_show_uv: number | null;
  not_open_game_click_uv: number | null;
  not_open_game_pay_uv: number | null;
  not_open_show_per: number | null;
  not_open_click_per: number | null;
  not_open_pay_per: number | null;
  open_game_uv: number | null;
  open_game_click_uv: number | null;
  open_game_pay_uv: number | null;
  open_game_click_per: number | null;
  open_game_pay_per: number | null;
  raw: Record<string, unknown>;
}

interface RawResp {
  data: Record<string, unknown>;
}

export async function fetchSessionMinigame(
  page: Page,
  roomId: string,
): Promise<{ overview: Record<string, unknown>; convert: Record<string, unknown> }> {
  const ovRes = await pageFetch<RawResp>(page, `${OVERVIEW}?roomID=${roomId}`, {
    headers: { "X-Appid": "3000" },
  });
  const cvRes = await pageFetch<RawResp>(page, `${AUDIENCE_CONVERT}?roomID=${roomId}`, {
    headers: { "X-Appid": "3000" },
  });
  return { overview: ovRes.data, convert: cvRes.data };
}

export function parseSessionMinigameResponse(
  overview: Record<string, unknown>,
  convert: Record<string, unknown>,
  roomId: string,
  anchorId: string,
  date: string,
): SessionMgRow {
  return {
    room_id: roomId,
    anchor_id: anchorId,
    date,
    acu: numOrNull(overview.acu),
    show_uv: numOrNull(overview.show_uv),
    not_open_game_uv: numOrNull(convert.notOpenGameUV),
    not_open_game_show_uv: numOrNull(convert.notOpenGameShowUV),
    not_open_game_click_uv: numOrNull(convert.notOpenGameClickUV),
    not_open_game_pay_uv: numOrNull(convert.notOpenGamePayUV),
    not_open_show_per: pctOrNull(convert.notOpenShowPer),
    not_open_click_per: pctOrNull(convert.notOpenClickPer),
    not_open_pay_per: pctOrNull(convert.notOpenPayPer),
    open_game_uv: numOrNull(convert.openGameUV),
    open_game_click_uv: numOrNull(convert.openGameClickUV),
    open_game_pay_uv: numOrNull(convert.openGamePayUV),
    open_game_click_per: pctOrNull(convert.openGameClickPer),
    open_game_pay_per: pctOrNull(convert.openGamePayPer),
    raw: { overview, convert },
  };
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pctOrNull(v: unknown): number | null {
  const n = numOrNull(v);
  if (n === null) return null;
  return n > 1 ? n / 100 : n;
}
