import { describe, expect, it } from "vitest";
import { BusinessLine, UpsertAnchorInput } from "@/modules/live-anchor/schema";

describe("live anchor schema", () => {
  it("accepts 造化仙府 as a business line", () => {
    expect(BusinessLine.parse("造化仙府")).toBe("造化仙府");
    expect(
      UpsertAnchorInput.parse({
        dingtalk_user_id: "ding-user-1",
        business_line: "造化仙府",
        employment_type: "正式",
      }).business_line,
    ).toBe("造化仙府");
  });
});
