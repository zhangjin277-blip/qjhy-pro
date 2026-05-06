/**
 * 排班时段命中工具。
 * - time_slots 格式：[["12:00","18:00"], ...]，end 取开区间
 * - 跨日时段（end < start，如 22:00-03:00）按"或"逻辑命中
 * - rest_days 用 ISO weekday：1=周一 ... 7=周日
 */

function parseHour(timeStr: string): number {
  const h = parseInt(timeStr.split(":")[0] ?? "0", 10);
  return h;
}

export function hourMatchesTimeSlots(slots: [string, string][], hour: number): boolean {
  for (const [startStr, endStr] of slots) {
    const start = parseHour(startStr);
    const end = parseHour(endStr);
    if (end > start) {
      // 普通时段：[start, end)
      if (hour >= start && hour < end) return true;
    } else if (end < start) {
      // 跨日时段：22:00-03:00 → hour >= 22 OR hour < 3
      if (hour >= start || hour < end) return true;
    } else {
      // start === end，无意义，跳过
      continue;
    }
  }
  return false;
}

export function isRestDay(rest_days: number[], date: Date): boolean {
  // JS 的 getDay 是 0=周日 ... 6=周六
  // ISO weekday 是 1=周一 ... 7=周日
  const jsDay = date.getDay();
  const isoDay = jsDay === 0 ? 7 : jsDay;
  return rest_days.includes(isoDay);
}
