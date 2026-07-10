/**
 * go-recorder 名单文件 `builtin_urls.txt` 的解析与安全读写(纯字符串逻辑,无 IO)。
 *
 * 真实格式(每行一个条目):
 *   https://live.douyin.com/90910615050,主播:原始传奇   → 正常录制
 *   #https://live.douyin.com/24144594616,主播:芝麻（赢豆版）→ 行首 # = 暂停
 *   3129518236                                            → 纯房间号(无 ,主播: 后缀)
 *   https://union.bytedance.com/...                        → 非直播间行,原样保留
 *
 * 原则:写回时**保留所有原始行**(含空行、无法识别的行),只改动目标条目,绝不丢数据。
 * go-recorder 每 3 秒热重载此文件。
 */

export interface StreamerEntry {
  /** 该条目在文件中的行号(0 起),用于精确定位改写 */
  index: number;
  /** 是否暂停(行首 #) */
  paused: boolean;
  /** 核心标识:去掉 # 与 ,主播: 后缀后的 URL 或房间号 */
  url: string;
  /** 主播名(",主播:" 后缀),无则 "" */
  name: string;
  /** 是否是一个有内容的直播间条目(url 非空) */
  recognized: boolean;
}

const NAME_SEP = /,\s*主播\s*:/;

/** 解析整个文件为条目列表(保留每一行,包括空行/未识别行) */
export function parseUrlsFile(content: string): StreamerEntry[] {
  const lines = content.split("\n");
  return lines.map((rawLine, index) => {
    const line = rawLine.trim();
    const paused = line.startsWith("#");
    const body = paused ? line.slice(1).trim() : line;
    let url = body;
    let name = "";
    const m = body.split(NAME_SEP);
    if (m.length >= 2) {
      url = (m[0] ?? "").trim();
      name = m.slice(1).join("").trim();
    }
    return { index, paused, url, name, recognized: url.length > 0 };
  });
}

/** 只返回“像录制主播”的条目(url 非空)。展示名单用。 */
export function listStreamers(content: string): StreamerEntry[] {
  return parseUrlsFile(content).filter((e) => e.recognized);
}

/**
 * 从 url 推断平台与房间号(用于匹配封面 `{平台}_{房间号}.jpg` 与显示平台标签)。
 * 平台名与 go-recorder 一致:Douyin / Kuaishou / Soop。
 */
export function parsePlatformRoom(url: string): { platform: string; roomId: string } {
  const u = url.toLowerCase();
  let platform = "";
  if (u.includes("douyin.com")) platform = "Douyin";
  else if (u.includes("kuaishou") || u.includes("chenzhongtech")) platform = "Kuaishou";
  else if (u.includes("sooplive") || u.includes("afreeca")) platform = "Soop";
  const nums = url.match(/\d+/g);
  const roomId = nums && nums.length > 0 ? (nums[nums.length - 1] ?? "") : "";
  return { platform, roomId };
}

/** 平台中文名 */
export function platformLabel(platform: string): string {
  if (platform === "Douyin") return "抖音";
  if (platform === "Kuaishou") return "快手";
  if (platform === "Soop") return "Soop";
  return "其他";
}

/** 从录像文件名解析开播时间(`<名>_YYYY-MM-DD_HH-MM-SS[_NNN].ts`),失败返回 null(毫秒时间戳) */
export function parseStartTimeMs(filename: string): number | null {
  const m = /_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/.exec(filename);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const t = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s),
  ).getTime();
  return Number.isNaN(t) ? null : t;
}

function buildLine(paused: boolean, url: string, name: string): string {
  const core = name ? `${url},主播:${name}` : url;
  return paused ? `#${core}` : core;
}

/**
 * 追加一个录制主播。url 原样写入(go-recorder 自己解析链接/平台);
 * 若同一 url 已存在(不论暂停与否)则不重复添加,返回原内容。
 */
export function addStreamer(content: string, url: string, name = ""): string {
  const cleanUrl = url.trim();
  if (!cleanUrl) return content;
  const existing = parseUrlsFile(content).find((e) => e.url === cleanUrl);
  if (existing) return content;
  const newLine = buildLine(false, cleanUrl, name.trim());
  // 末尾无换行则补一个,保证新行独立
  const sep = content.length === 0 || content.endsWith("\n") ? "" : "\n";
  return `${content}${sep}${newLine}\n`;
}

/** 按行号改写一行;越界或未识别则原样返回 */
function replaceLine(
  content: string,
  index: number,
  transform: (e: StreamerEntry) => string | null,
): string {
  const lines = content.split("\n");
  if (index < 0 || index >= lines.length) return content;
  const entries = parseUrlsFile(content);
  const entry = entries[index];
  if (!entry || !entry.recognized) return content;
  const next = transform(entry);
  if (next === null) {
    lines.splice(index, 1); // 删除该行
  } else {
    lines[index] = next;
  }
  return lines.join("\n");
}

/** 暂停/恢复(按行号) */
export function setPausedAt(content: string, index: number, paused: boolean): string {
  return replaceLine(content, index, (e) => buildLine(paused, e.url, e.name));
}

/** 删除(按行号) */
export function removeAt(content: string, index: number): string {
  return replaceLine(content, index, () => null);
}

/** 改名(按行号) */
export function renameAt(content: string, index: number, newName: string): string {
  return replaceLine(content, index, (e) => buildLine(e.paused, e.url, newName.trim()));
}
