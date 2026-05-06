export function parseSlotHour(slotEnd: string): number {
  const m = slotEnd.match(/^(\d{1,2}):/);
  if (!m) throw new Error(`Invalid slot time: ${slotEnd}`);
  return Number(m[1]);
}

export function coversHour(slot: [string, string], hour: number): boolean {
  const sh = parseSlotHour(slot[0]);
  const eh = parseSlotHour(slot[1]);
  if (sh < eh) return hour >= sh && hour < eh;
  if (sh > eh) return hour >= sh || hour < eh;
  return false;
}
