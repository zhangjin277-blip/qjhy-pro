export interface DingtalkUserCandidate {
  user_id: string;
  name: string;
}

/**
 * 经纪人姓名 ↔ 钉钉 user.name 模糊匹配。
 * 优先级：精确 > 去括号精确 > 去括号字符子串 > 去括号内容精确 > null。
 */
export function fuzzyMatchBroker(
  brokerName: string,
  users: DingtalkUserCandidate[],
): DingtalkUserCandidate | null {
  // 去除括号及其内容
  const stripParen = (s: string): string => s.replace(/\(.*?\)|（.*?）/g, "").trim();
  // 仅去除括号符号，保留括号内文字（"陈泰(运营)" → "陈泰运营"）
  const flattenParen = (s: string): string => s.replace(/[()（）]/g, "").trim();

  const normalized = stripParen(brokerName);
  if (!normalized) return null;

  // 1. 精确（原始 or 去括号）
  const exact = users.find((u) => u.name === brokerName || u.name === normalized);
  if (exact) return exact;

  // 2. 去括号精确：用户名去掉括号及内容后 === normalized
  const userNoParen = users.find((u) => stripParen(u.name) === normalized);
  if (userNoParen) return userNoParen;

  // 3. 展平括号后精确：broker normalized 包含用户展平名 or 用户展平名包含 normalized
  //    "陈泰运营" matches "陈泰(运营)" because flattenParen("陈泰(运营)") = "陈泰运营"
  const flattenMatch = users.find((u) => {
    const uf = flattenParen(u.name);
    return uf === normalized || uf === flattenParen(brokerName);
  });
  if (flattenMatch) return flattenMatch;

  // 4. 子串（用户名包含 normalized）
  const subForward = users.find((u) => u.name.includes(normalized));
  if (subForward) return subForward;

  return null;
}
