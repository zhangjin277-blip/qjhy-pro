import { describe, it, expect } from "vitest";
import {
  saveOverrideInputSchema,
  replaceSegmentInputSchema,
  resizeSegmentInputSchema,
  scheduleSnapshotInputSchema,
  removeAccountInputSchema,
  clearAllInputSchema,
  dateOnlySchema,
  segmentIdSchema,
} from "@/app/(dashboard)/live-accounts/schedule-today/schema";

describe("schedule-today schemas", () => {
  describe("saveOverrideInputSchema", () => {
    it("accepts minimal valid input", () => {
      const r = saveOverrideInputSchema.parse({
        account_id: "acc-1",
        date: "2026-05-28",
        dingtalk_user_id: "u1",
        time_slots: [["09:00", "12:00"]],
      });
      expect(r.account_id).toBe("acc-1");
      expect(r.time_slots).toEqual([["09:00", "12:00"]]);
      expect(r.is_rest).toBeUndefined();
    });

    it("accepts empty time_slots (休假)", () => {
      const r = saveOverrideInputSchema.parse({
        account_id: "acc-1",
        date: "2026-05-28",
        dingtalk_user_id: "u1",
        time_slots: [],
      });
      expect(r.time_slots).toEqual([]);
    });

    it("rejects invalid date format", () => {
      expect(() =>
        saveOverrideInputSchema.parse({
          account_id: "acc-1",
          date: "2026/05/28",
          dingtalk_user_id: "u1",
          time_slots: [],
        }),
      ).toThrow();
    });

    it("rejects invalid time format (no colon)", () => {
      expect(() =>
        saveOverrideInputSchema.parse({
          account_id: "acc-1",
          date: "2026-05-28",
          dingtalk_user_id: "u1",
          time_slots: [["0900", "1200"]],
        }),
      ).toThrow();
    });

    it("rejects empty account_id", () => {
      expect(() =>
        saveOverrideInputSchema.parse({
          account_id: "",
          date: "2026-05-28",
          dingtalk_user_id: "u1",
          time_slots: [],
        }),
      ).toThrow();
    });

    it("rejects missing required fields", () => {
      expect(() => saveOverrideInputSchema.parse({ account_id: "acc-1" })).toThrow();
    });
  });

  describe("replaceSegmentInputSchema", () => {
    it("requires from_dingtalk_user_id and from_time_slot", () => {
      const r = replaceSegmentInputSchema.parse({
        account_id: "acc-1",
        date: "2026-05-28",
        dingtalk_user_id: "u2",
        time_slots: [["14:00", "18:00"]],
        from_dingtalk_user_id: "u1",
        from_time_slot: ["14:00", "18:00"],
      });
      expect(r.from_dingtalk_user_id).toBe("u1");
      expect(r.from_time_slot).toEqual(["14:00", "18:00"]);
    });

    it("rejects when from_ fields missing", () => {
      expect(() =>
        replaceSegmentInputSchema.parse({
          account_id: "acc-1",
          date: "2026-05-28",
          dingtalk_user_id: "u2",
          time_slots: [["14:00", "18:00"]],
        }),
      ).toThrow();
    });
  });

  describe("resizeSegmentInputSchema", () => {
    it("requires only from_time_slot (same user)", () => {
      const r = resizeSegmentInputSchema.parse({
        account_id: "acc-1",
        date: "2026-05-28",
        dingtalk_user_id: "u1",
        time_slots: [["09:00", "14:00"]],
        from_time_slot: ["09:00", "12:00"],
      });
      expect(r.from_time_slot).toEqual(["09:00", "12:00"]);
    });
  });

  describe("scheduleSnapshotInputSchema", () => {
    it("accepts empty segments array", () => {
      const r = scheduleSnapshotInputSchema.parse({
        account_id: "acc-1",
        date: "2026-05-28",
        segments: [],
      });
      expect(r.segments).toEqual([]);
    });

    it("validates segment shape", () => {
      const r = scheduleSnapshotInputSchema.parse({
        account_id: "acc-1",
        date: "2026-05-28",
        segments: [
          {
            dingtalk_user_id: "u1",
            time_slot: ["09:00", "12:00"],
            is_rest: false,
            reason: null,
            source: "manual",
          },
        ],
      });
      expect(r.segments[0]?.is_rest).toBe(false);
    });

    it("rejects when segment missing is_rest", () => {
      expect(() =>
        scheduleSnapshotInputSchema.parse({
          account_id: "acc-1",
          date: "2026-05-28",
          segments: [
            {
              dingtalk_user_id: "u1",
              time_slot: ["09:00", "12:00"],
              reason: null,
            },
          ],
        }),
      ).toThrow();
    });
  });

  describe("removeAccountInputSchema", () => {
    it("validates account_id + date", () => {
      const r = removeAccountInputSchema.parse({
        account_id: "acc-1",
        date: "2026-05-28",
      });
      expect(r.account_id).toBe("acc-1");
      expect(r.date).toBe("2026-05-28");
    });
  });

  describe("clearAllInputSchema", () => {
    it("accepts date with no account_ids (validated downstream)", () => {
      const r = clearAllInputSchema.parse({ date: "2026-05-28" });
      expect(r.account_ids).toBeUndefined();
    });

    it("accepts non-empty account_ids", () => {
      const r = clearAllInputSchema.parse({
        date: "2026-05-28",
        account_ids: ["a", "b"],
      });
      expect(r.account_ids).toEqual(["a", "b"]);
    });

    it("rejects empty account_ids array", () => {
      expect(() =>
        clearAllInputSchema.parse({
          date: "2026-05-28",
          account_ids: [],
        }),
      ).toThrow();
    });
  });

  describe("primitive schemas", () => {
    it("dateOnlySchema accepts YYYY-MM-DD only", () => {
      expect(dateOnlySchema.parse("2026-05-28")).toBe("2026-05-28");
      expect(() => dateOnlySchema.parse("2026/05/28")).toThrow();
      expect(() => dateOnlySchema.parse("invalid")).toThrow();
    });

    it("segmentIdSchema rejects empty string", () => {
      expect(segmentIdSchema.parse("abc")).toBe("abc");
      expect(() => segmentIdSchema.parse("")).toThrow();
    });
  });
});
