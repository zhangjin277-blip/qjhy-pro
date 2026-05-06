export interface DefaultSchedule {
  user: string;
  slots: [string, string][];
  rest_days: number[];
}

export interface OverrideSchedule {
  user: string;
  slots: [string, string][];
}

export interface EffectiveSchedule {
  user: string;
  slots: [string, string][];
  rest_days: number[];
  source: "default" | "override";
}

export function mergeWithOverride(
  defaults: DefaultSchedule[],
  overrides: OverrideSchedule[],
): EffectiveSchedule[] {
  const overrideByUser = new Map(overrides.map((o) => [o.user, o]));
  const result: EffectiveSchedule[] = [];

  for (const d of defaults) {
    const ov = overrideByUser.get(d.user);
    if (ov) {
      result.push({ user: d.user, slots: ov.slots, rest_days: d.rest_days, source: "override" });
    } else {
      result.push({ user: d.user, slots: d.slots, rest_days: d.rest_days, source: "default" });
    }
  }

  const defaultUsers = new Set(defaults.map((d) => d.user));
  for (const ov of overrides) {
    if (!defaultUsers.has(ov.user)) {
      result.push({ user: ov.user, slots: ov.slots, rest_days: [], source: "override" });
    }
  }

  return result;
}
