import { beforeEach, describe, expect, it, vi } from "vitest";
const { where } = vi.hoisted(() => ({ where: vi.fn() }));
vi.mock("@/db/client", () => ({ db: { select: () => ({ from: () => ({ where }) }) } }));
import { isNotificationEnabled } from "@/lib/notify/settings";

describe("notification delivery switch", () => {
  beforeEach(() => vi.clearAllMocks());
  it("honors an explicit disabled setting", async () => {
    where.mockResolvedValue([{ enabled: false }]);
    expect(await isNotificationEnabled("crawler_error")).toBe(false);
  });
  it("keeps existing alerts enabled without a saved setting", async () => {
    where.mockResolvedValue([]);
    expect(await isNotificationEnabled("cookie_expired")).toBe(true);
  });
  it("keeps alerts enabled when configuration storage is unavailable", async () => {
    where.mockRejectedValue(new Error("storage unavailable"));
    const warn = vi.spyOn(console, "warn").mockImplementation(vi.fn());
    expect(await isNotificationEnabled("placement_alert")).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
