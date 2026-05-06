import { pinyin } from "pinyin";

export interface DingtalkCandidate {
  user_id: string;
  name: string;
  mobile: string | null;
}

export type MatchResult =
  | { kind: "exact"; match: DingtalkCandidate }
  | { kind: "ambiguous"; candidates: DingtalkCandidate[] }
  | { kind: "none" };

function getInitials(name: string): string {
  return pinyin(name, { style: pinyin.STYLE_FIRST_LETTER, heteronym: false })
    .map((arr) => arr[0]?.toUpperCase() ?? "")
    .join("");
}

/** 全拼（不带声调），如"刘昊宇" → "liuhaoyu" */
function getFullPinyin(name: string): string {
  return pinyin(name, { style: pinyin.STYLE_NORMAL, heteronym: false })
    .map((arr) => (arr[0] ?? "").toLowerCase())
    .join("");
}

export function matchName(input: string, candidates: DingtalkCandidate[]): MatchResult {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "none" };

  // 1. 完全匹配
  const exact = candidates.find((c) => c.name.trim() === trimmed);
  if (exact) return { kind: "exact", match: exact };

  // 2. 包含匹配（双向）
  const containsMatches = candidates.filter(
    (c) => c.name.includes(trimmed) || trimmed.includes(c.name),
  );

  // 3. 拼音首字母匹配
  const upperInput = trimmed.toUpperCase();
  const pinyinMatches = candidates.filter((c) => {
    const initials = getInitials(c.name);
    return initials === upperInput;
  });

  // 4. 全拼相同（同音字错别字，如"刘浩宇" ↔ "刘昊宇"）
  const inputFullPinyin = getFullPinyin(trimmed);
  const homophoneMatches = inputFullPinyin
    ? candidates.filter((c) => getFullPinyin(c.name) === inputFullPinyin && c.name !== trimmed)
    : [];

  // 合并 ambiguous 候选去重
  const candMap = new Map<string, DingtalkCandidate>();
  for (const c of [...containsMatches, ...pinyinMatches, ...homophoneMatches]) {
    candMap.set(c.user_id, c);
  }
  const merged = [...candMap.values()];

  if (merged.length === 0) return { kind: "none" };
  return { kind: "ambiguous", candidates: merged };
}
