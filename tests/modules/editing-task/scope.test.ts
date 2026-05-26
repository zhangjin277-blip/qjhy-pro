import { describe, it, expect } from "vitest";
import { buildEditingScopeWhere } from "@/modules/editing-task/scope";

describe("buildEditingScopeWhere", () => {
  it("all scope returns no extra filter", async () => {
    const w = await buildEditingScopeWhere({ scope: "all", userId: "u1" });
    expect(w).toBe(undefined);
  });

  it("none scope returns impossible filter", async () => {
    const w = await buildEditingScopeWhere({ scope: "none", userId: "u1" });
    // Drizzle sql`false` stores chunks; verify it encodes a falsy condition
    const raw = JSON.stringify(w);
    expect(raw).toMatch(/false|1\s*=\s*0/i);
  });

  it.todo("team scope filters by managed dept member operators");
  it.todo("self scope OR-merges relevant conditions");
});
