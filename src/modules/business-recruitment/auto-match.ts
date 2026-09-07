import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  anchor_profile,
  business_recruitment_candidate,
  business_recruitment_event,
} from "@/db/schema";

/**
 * 将抖音主播档案中的平台时间转换为候选人表使用的日期（中国时区）。
 * 平台返回的是 Unix 秒，不能直接用服务器时区截取 ISO 字符串。
 */
function platformDate(value: number | string | null): string | null {
  if (value == null || Number(value) <= 0) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    calendar: "gregory",
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(Number(value) * 1000));
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

interface AnchorSource {
  anchorId: string;
  awemeDisplayId: string | null;
  awemeShortId: string | null;
  joinTime: number | null;
  firstLiveTimeInFaction: number | null;
}

function addIndex(index: Map<string, AnchorSource[]>, value: string | null, source: AnchorSource) {
  const key = value?.trim();
  if (!key) return;
  const current = index.get(key) ?? [];
  if (!current.some((item) => item.anchorId === source.anchorId)) current.push(source);
  index.set(key, current);
}

function uniqueSources(sources: AnchorSource[]): AnchorSource[] {
  return [...new Map(sources.map((source) => [source.anchorId, source])).values()];
}

/**
 * 从每日抖音主播档案同步候选人的入会/首播日期。
 *
 * 只填充候选人当前为空的日期，保留人工确认过的值；账号匹配必须是
 * 抖音号（aweme display/short id）或平台 UID 的精确匹配，避免同名误关联。
 */
export async function syncRecruitmentDatesFromAnchorProfiles(): Promise<{
  matched: number;
  joinDatesFilled: number;
  firstLiveDatesFilled: number;
  conflicts: number;
  unmatched: number;
  ambiguous: number;
}> {
  const [candidates, profiles] = await Promise.all([
    db
      .select({
        id: business_recruitment_candidate.id,
        accountId: business_recruitment_candidate.account_id,
        uid: business_recruitment_candidate.uid,
        joinDate: business_recruitment_candidate.join_date,
        firstLiveDate: business_recruitment_candidate.first_live_date,
      })
      .from(business_recruitment_candidate)
      .where(eq(business_recruitment_candidate.platform, "douyin")),
    db
      .select({
        anchorId: anchor_profile.anchor_id,
        awemeDisplayId: anchor_profile.aweme_display_id,
        awemeShortId: anchor_profile.aweme_short_id,
        joinTime: anchor_profile.join_time,
        firstLiveTimeInFaction: anchor_profile.first_live_time_in_faction,
      })
      .from(anchor_profile),
  ]);

  const byAccountId = new Map<string, AnchorSource[]>();
  const byAnchorId = new Map<string, AnchorSource[]>();
  for (const profile of profiles) {
    const source: AnchorSource = {
      anchorId: profile.anchorId,
      awemeDisplayId: profile.awemeDisplayId,
      awemeShortId: profile.awemeShortId,
      joinTime: profile.joinTime == null ? null : Number(profile.joinTime),
      firstLiveTimeInFaction:
        profile.firstLiveTimeInFaction == null ? null : Number(profile.firstLiveTimeInFaction),
    };
    addIndex(byAccountId, source.awemeDisplayId, source);
    addIndex(byAccountId, source.awemeShortId, source);
    addIndex(byAnchorId, source.anchorId, source);
  }

  const updates: {
    id: string;
    joinDate: string | null;
    firstLiveDate: string | null;
    matchedBy: "account_id" | "uid";
    source: AnchorSource;
    previousJoinDate: string | null;
    previousFirstLiveDate: string | null;
  }[] = [];
  let conflicts = 0;
  let unmatched = 0;
  let ambiguous = 0;

  for (const candidate of candidates) {
    const accountMatches = uniqueSources(byAccountId.get(candidate.accountId.trim()) ?? []);
    const uidMatches = uniqueSources(
      candidate.uid ? (byAnchorId.get(candidate.uid.trim()) ?? []) : [],
    );
    const accountSource = accountMatches.length === 1 ? accountMatches[0] : undefined;
    const uidSource = uidMatches.length === 1 ? uidMatches[0] : undefined;
    let source: AnchorSource | undefined;
    let matchedBy: "account_id" | "uid";

    if (accountSource && uidMatches.length === 0) {
      source = accountSource;
      matchedBy = "account_id";
    } else if (uidSource && accountMatches.length === 0) {
      source = uidSource;
      matchedBy = "uid";
    } else if (accountSource && uidSource && accountSource.anchorId === uidSource.anchorId) {
      source = accountSource;
      matchedBy = "account_id";
    } else if (accountMatches.length > 1 || uidMatches.length > 1) {
      ambiguous += 1;
      continue;
    } else if (accountMatches.length === 1 && uidMatches.length === 1) {
      // 两个填写的身份字段指向不同主播，宁可不自动写入。
      ambiguous += 1;
      continue;
    } else {
      unmatched += 1;
      continue;
    }

    if (!source) {
      unmatched += 1;
      continue;
    }

    const joinDate = platformDate(source.joinTime);
    const firstLiveDate = platformDate(source.firstLiveTimeInFaction);
    // 平台偶尔会返回早于当前入会时间的历史首播时间（例如换公会/重新签约），
    // 这类值不能作为本次招募的首播日期。
    const safeFirstLiveDate =
      firstLiveDate && (!joinDate || firstLiveDate >= joinDate) ? firstLiveDate : null;
    const joinNeedsFill = !candidate.joinDate && Boolean(joinDate);
    const firstLiveNeedsFill = !candidate.firstLiveDate && Boolean(safeFirstLiveDate);
    if (!joinNeedsFill && !firstLiveNeedsFill) {
      if (
        (candidate.joinDate && joinDate && candidate.joinDate !== joinDate) ||
        (candidate.firstLiveDate &&
          safeFirstLiveDate &&
          candidate.firstLiveDate !== safeFirstLiveDate)
      ) {
        conflicts += 1;
      }
      continue;
    }
    updates.push({
      id: candidate.id,
      joinDate: joinNeedsFill ? joinDate : null,
      firstLiveDate: firstLiveNeedsFill ? safeFirstLiveDate : null,
      matchedBy,
      source,
      previousJoinDate: candidate.joinDate,
      previousFirstLiveDate: candidate.firstLiveDate,
    });
  }

  if (updates.length > 0) {
    const now = new Date();
    await db.transaction(async (tx) => {
      for (const update of updates) {
        const set: {
          join_date?: string;
          first_live_date?: string;
          updated_at: Date;
        } = { updated_at: now };
        if (update.joinDate) set.join_date = update.joinDate;
        if (update.firstLiveDate) set.first_live_date = update.firstLiveDate;
        await tx
          .update(business_recruitment_candidate)
          .set(set)
          .where(eq(business_recruitment_candidate.id, update.id));
        await tx.insert(business_recruitment_event).values({
          candidate_id: update.id,
          actor_user_id: null,
          event_type: "recruitment_dates_auto_matched",
          from_status: null,
          to_status: null,
          payload: {
            source: "anchor_profile",
            matchedBy: update.matchedBy,
            anchorId: update.source.anchorId,
            joinDate: update.joinDate,
            firstLiveDate: update.firstLiveDate,
            previousJoinDate: update.previousJoinDate,
            previousFirstLiveDate: update.previousFirstLiveDate,
          },
        });
      }
    });
  }

  return {
    matched: updates.length,
    joinDatesFilled: updates.filter((update) => update.joinDate).length,
    firstLiveDatesFilled: updates.filter((update) => update.firstLiveDate).length,
    conflicts,
    unmatched,
    ambiguous,
  };
}
