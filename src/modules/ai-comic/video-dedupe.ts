interface OfficialWorkIdentity {
  item_id: string;
  publish_time: Date;
  description: string | null;
}

function looksRounded(itemId: string): boolean {
  return /^\d{16,}$/.test(itemId) && itemId.endsWith("000");
}

/** Collapse legacy rows whose numeric Douyin IDs were rounded by JSON.parse. */
export function dedupeOfficialWorks<T extends OfficialWorkIdentity>(rows: readonly T[]): T[] {
  const works = new Map<string, T>();
  for (const row of rows) {
    const key = `${row.publish_time.getTime()}\0${row.description ?? ""}`;
    const existing = works.get(key);
    if (!existing || (looksRounded(existing.item_id) && !looksRounded(row.item_id))) {
      works.set(key, row);
    }
  }
  return [...works.values()];
}
