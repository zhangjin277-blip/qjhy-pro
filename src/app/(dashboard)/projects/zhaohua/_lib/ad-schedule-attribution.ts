export interface HourlyAdRow {
  date?: string;
  hour?: number;
  cost?: number;
  exposure?: number;
  clicks?: number;
  added?: number;
}

export interface OfficialShiftForAd {
  date: string;
  assignments: { role: string; startTime: string; endTime: string }[];
}

export interface AuctionRosterForAd {
  anchorType?: string;
  liveTimeSlots?: { start: string; end: string }[];
}

function hourFromTime(value: string): number {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) + Number(minute) / 60;
}

function inSlot(hour: number, startValue: string, endValue: string): boolean {
  const start = hourFromTime(startValue);
  const end = hourFromTime(endValue);
  return end > start ? hour >= start && hour < end : hour >= start || hour < end;
}

export function classifyAdHour(
  row: HourlyAdRow,
  officialShifts: OfficialShiftForAd[],
  auctionRoster: AuctionRosterForAd[],
): "official" | "individual" | "unassigned" {
  if (!row.date || row.hour === undefined) return "unassigned";
  const hasAnySchedule =
    officialShifts.length > 0 ||
    auctionRoster.some((anchor) => (anchor.liveTimeSlots ?? []).length > 0);
  if (!hasAnySchedule) return "official";
  const official = officialShifts
    .filter((shift) => shift.date === row.date)
    .some((shift) =>
      shift.assignments.some(
        (assignment) =>
          assignment.role === "主播" &&
          inSlot(row.hour as number, assignment.startTime, assignment.endTime),
      ),
    );
  if (official) return "official";
  const individual = auctionRoster.some(
    (anchor) =>
      anchor.anchorType === "竞价主播" &&
      (anchor.liveTimeSlots ?? []).some((slot) => inSlot(row.hour as number, slot.start, slot.end)),
  );
  return individual ? "individual" : "unassigned";
}
