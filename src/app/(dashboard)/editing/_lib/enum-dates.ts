/**
 * 枚举 [start, end] 闭区间内的日历日期串（YYYY-MM-DD）。
 * start/end 是纯日历日期，与时区无关 —— 全程按 UTC 解析与迭代，
 * 不能构造本地零点再 toISOString（UTC+8 下会整体倒退一天，
 * 甘特表头曾因此把周一标成 7/5、且周日列丢失）。
 */
export function enumDates(start: string, end: string): string[] {
  const result: string[] = [];
  const d = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  while (d <= e) {
    result.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return result;
}
