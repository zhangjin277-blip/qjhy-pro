/** Preserve calendar dates from legacy records without converting midnight to UTC. */
export function legacyCalendarDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  const match = String(value)
    .trim()
    .match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:$|[ T])/);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day)
  )
    return null;
  return `${year}-${month?.padStart(2, "0")}-${day?.padStart(2, "0")}`;
}

/** Procurement dates follow the business timezone, regardless of the server timezone. */
export function businessDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
