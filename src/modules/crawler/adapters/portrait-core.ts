import "server-only";
import type { Page } from "puppeteer-core";
import { pageFetch } from "@/lib/puppeteer";

const ENDPOINT_BASE =
  "https://union.bytedance.com/ark/api/uanchor/pugna_component/data/anchor/portrait/core_day_stats";

export interface PortraitRow {
  anchor_id: string;
  date: string;
  show_uv: number | null;
  enter_uv: number | null;
  enter_ratio: number | null;
  pay_ucnt: number | null;
  pay_ratio: number | null;
  raw: Record<string, unknown>;
}

interface RawResp {
  data: Record<string, unknown>;
}

export async function fetchPortraitCoreForAnchor(
  page: Page,
  anchorId: string,
  date: string,
  cid: string,
): Promise<Record<string, unknown>> {
  const url = `${ENDPOINT_BASE}/${cid}?anchorID=${anchorId}&beginDate=${date}&endDate=${date}`;
  const res = await pageFetch<RawResp>(page, url, {
    headers: { "X-Appid": "3000" },
  });
  return res.data;
}

export function parsePortraitCoreResponse(
  data: Record<string, unknown>,
  anchorId: string,
  date: string,
): PortraitRow {
  // core_day_stats 返回结构平台具体形式以实际抓为准——这里假设 series[0] 含字段
  // 真实接入时根据 Chrome DevTools 抓的 sample 修
  const series = (data.series ?? data.list ?? []) as Record<string, unknown>[];
  const r = series[0] ?? {};
  return {
    anchor_id: anchorId,
    date,
    show_uv: numOrNull(r.showUv),
    enter_uv: numOrNull(r.enterUv),
    enter_ratio: pctOrNull(r.enterRatio),
    pay_ucnt: numOrNull(r.payUcnt),
    pay_ratio: pctOrNull(r.payRatio),
    raw: r,
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
