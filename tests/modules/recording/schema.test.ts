import { describe, expect, it } from "vitest";
import {
  AddStreamerInput,
  ControlStreamerInput,
  DeleteRecordingFileInput,
  UpdateRecorderConfigInput,
} from "@/modules/recording/schema";

describe("recording schemas", () => {
  it("AddStreamerInput 去空白、拒空串", () => {
    expect(AddStreamerInput.parse({ url: " https://live.douyin.com/123 " }).url).toBe(
      "https://live.douyin.com/123",
    );
    expect(() => AddStreamerInput.parse({ url: "  " })).toThrow();
  });

  it("ControlStreamerInput 只收三种 action", () => {
    expect(() =>
      ControlStreamerInput.parse({ action: "nuke", platform: "Douyin", roomId: "1" }),
    ).toThrow();
  });

  it("UpdateRecorderConfigInput 边界", () => {
    expect(() =>
      UpdateRecorderConfigInput.parse({ quality: "uhd", segment_time: -1, check_interval: 30 }),
    ).toThrow();
    expect(() =>
      UpdateRecorderConfigInput.parse({ quality: "4k", segment_time: 0, check_interval: 30 }),
    ).toThrow();
  });

  it("DeleteRecordingFileInput 必填", () => {
    expect(() => DeleteRecordingFileInput.parse({ anchor: "a", file: "" })).toThrow();
  });
});
