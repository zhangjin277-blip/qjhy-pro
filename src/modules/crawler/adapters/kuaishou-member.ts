import "server-only";
import type { Page } from "puppeteer-core";
import { CookieExpiredError } from "@/lib/puppeteer";

const ENDPOINT = "/rest/cp/org/member/manage/v3/list";
const PAGE_SIZE = 10;
const MAX_PAGES = 30;

/**
 * 快手机构后台「成员管理」单条原始记录。
 * 来源：POST /rest/cp/org/member/manage/v3/list response.data.list[]
 */
export interface KuaishouMemberRaw {
  userId: number;
  memberId: number;
  userName: string;
  memberName: string;
  headImg: string | null;
  fansCount: number | null;
  brokerId: number | null;
  brokerName: string | null;
  joinTime: number | null; // 毫秒
  contractInfo?: {
    contractRenewTypeDesc?: string | null;
    contractRenewType?: number | null;
    contractExpireTime?: number | null; // 毫秒
    ecommerceExpireTime?: number | null;
  };
  agreements?: { agreementName: string; agreementType: number }[];
  contentCategory?: string | null;
  lastLiveTime?: number | null;
  lastPhotoTime?: number | null;
  livingUrl?: string | null;
  // 其他字段（coreData 等）保留 raw 但不解构
  [key: string]: unknown;
}

export interface KuaishouMemberListResp {
  result: number;
  data?: {
    total: number;
    list: KuaishouMemberRaw[];
  };
  message?: string;
}

/**
 * 翻页拉取全部成员（机构通常 < 200 人）。
 * 浏览器 context 内调 fetch，依赖快手前端 SDK 全局 hook 自动加 __NS_sig3 签名。
 * api_ph 字段从 cookie 读出来塞进 body（业务后端要校验）。
 */
export async function fetchKuaishouMembers(page: Page): Promise<KuaishouMemberRaw[]> {
  const all: KuaishouMemberRaw[] = [];
  let total = Infinity;

  for (let p = 1; p <= MAX_PAGES; p++) {
    const { status, text } = await page.evaluate(
      async (endpoint, pageNum, count) => {
        const phMatch = document.cookie.match(/kuaishou\.web\.cp\.api_ph=([^;]+)/);
        const ph = phMatch?.[1] ?? "";
        const body = JSON.stringify({
          page: pageNum,
          count,
          memberIds: [],
          brokerId: 0,
          sort: 7,
          agreementType: -1,
          brokerType: -1,
          lastPhotoTimeRange: -1,
          lastLiveTimeTimeRange: -1,
          fansCountRange: -1,
          contentCategory: -1,
          contractRenewStatus: -1,
          "kuaishou.web.cp.api_ph": ph,
        });
        const res = await fetch(endpoint, {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body,
        });
        return { status: res.status, text: await res.text() };
      },
      ENDPOINT,
      p,
      PAGE_SIZE,
    );

    if (status === 401 || status === 403) {
      throw new CookieExpiredError(`Kuaishou auth failed (${status}) on page ${p}`);
    }
    if (!text.startsWith("{")) {
      throw new CookieExpiredError(
        `Kuaishou non-JSON response on page ${p} (likely redirected to login)`,
      );
    }
    const json = JSON.parse(text) as KuaishouMemberListResp;
    if (json.result !== 1) {
      throw new Error(
        `Kuaishou list API failed: result=${json.result} message=${json.message ?? ""}`,
      );
    }
    const list = json.data?.list ?? [];
    total = json.data?.total ?? total;
    console.log(
      `[kuaishou-member] page ${p}: got ${list.length} rows (cumulative ${all.length + list.length}/${total})`,
    );
    all.push(...list);
    if (list.length < PAGE_SIZE) break;
    if (all.length >= total) break;
  }

  return all;
}

/* ========== 字段映射 ========== */

/**
 * 已知的产品昵称关键词。匹配按数组顺序，先到先得。
 * 不匹配返回 null，前端归到「未分类」桶让人工对齐。
 */
const PRODUCT_PATTERNS: { product: string; pattern: RegExp }[] = [
  { product: "途游休闲捕鱼", pattern: /途游休闲捕鱼/ },
  { product: "电玩捕鱼", pattern: /电玩捕鱼/ },
  { product: "捕鱼大作战", pattern: /捕鱼大作战|3D版/ },
];

export function inferProductFromName(name: string): string | null {
  for (const { product, pattern } of PRODUCT_PATTERNS) {
    if (pattern.test(name)) return product;
  }
  return null;
}

/**
 * 姓名匹配 dingtalk_user：先精确，再去 emoji/空白/常见后缀再比一次。
 * dingtalkUserMap: Map<normalizedName, user_id>，由调用方预构造（精确名 + normalize 名都进 map）。
 */
const EMOJI_RANGES =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{1F600}-\u{1F64F}\u{1F900}-\u{1F9FF}]/gu;

export function normalizePersonName(name: string): string {
  return name.replace(EMOJI_RANGES, "").replace(/\s+/g, "").trim();
}

export interface MappedMember {
  account_name: string;
  platform: "快手";
  platform_account_id: string;
  avatar: string | null;
  product: string | null; // 推断不到 null
  agent_dingtalk_user_id: string | null;
  raw_payload: {
    fans_count: number | null;
    joined_at: string | null; // ISO yyyy-MM-dd
    contract_expire_at: string | null;
    renewal_status: string | null;
    contract_renew_type: number | null;
    broker_name_raw: string | null;
    agreements_raw: string[];
    content_category_raw: string | null;
    last_live_time: string | null;
    last_photo_time: string | null;
  };
  live_status: "living" | "offline" | "unknown";
}

export function mapKuaishouMember(
  raw: KuaishouMemberRaw,
  dingtalkUserByName: Map<string, string>,
): MappedMember {
  const accountName = raw.memberName || raw.userName;
  const product = inferProductFromName(accountName);

  let agentId: string | null = null;
  const brokerName = raw.brokerName?.trim() ?? "";
  if (brokerName) {
    agentId = dingtalkUserByName.get(brokerName) ?? null;
    if (!agentId) {
      const normalized = normalizePersonName(brokerName);
      if (normalized) agentId = dingtalkUserByName.get(normalized) ?? null;
    }
  }

  const isLiving = !!raw.livingUrl;

  return {
    account_name: accountName,
    platform: "快手",
    platform_account_id: String(raw.userId),
    avatar: raw.headImg ?? null,
    product,
    agent_dingtalk_user_id: agentId,
    raw_payload: {
      fans_count: raw.fansCount ?? null,
      joined_at: msToIsoDate(raw.joinTime),
      contract_expire_at: msToIsoDate(raw.contractInfo?.contractExpireTime),
      renewal_status: raw.contractInfo?.contractRenewTypeDesc ?? null,
      contract_renew_type: raw.contractInfo?.contractRenewType ?? null,
      broker_name_raw: brokerName || null,
      agreements_raw: (raw.agreements ?? []).map((a) => a.agreementName),
      content_category_raw: raw.contentCategory ?? null,
      last_live_time: msToIsoDateTime(raw.lastLiveTime ?? null),
      last_photo_time: msToIsoDateTime(raw.lastPhotoTime ?? null),
    },
    live_status: isLiving ? "living" : "unknown",
  };
}

function msToIsoDate(ms: number | null | undefined): string | null {
  if (!ms) return null;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function msToIsoDateTime(ms: number | null): string | null {
  if (!ms) return null;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}
