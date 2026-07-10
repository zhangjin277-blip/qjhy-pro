import { describe, expect, it } from "vitest";
import {
  addStreamer,
  listStreamers,
  parseUrlsFile,
  removeAt,
  renameAt,
  setPausedAt,
} from "@/modules/live-recording/urls";

// 真实文件样例(取自线上 builtin_urls.txt)
const SAMPLE = [
  "https://union.bytedance.com/open/portal/live_flow/followRoomDetail",
  "#https://live.douyin.com/24144594616,主播:芝麻（赢豆版）",
  "https://live.douyin.com/90910615050,主播:原始传奇",
  "3129518236",
].join("\n");

describe("parseUrlsFile", () => {
  it("解析暂停/名字/纯房间号/非直播间行,保留行号", () => {
    const entries = parseUrlsFile(SAMPLE);
    expect(entries).toHaveLength(4);

    expect(entries[1]).toMatchObject({
      index: 1,
      paused: true,
      url: "https://live.douyin.com/24144594616",
      name: "芝麻（赢豆版）",
      recognized: true,
    });
    expect(entries[2]).toMatchObject({
      index: 2,
      paused: false,
      url: "https://live.douyin.com/90910615050",
      name: "原始传奇",
    });
    // 纯房间号:无名字,仍算一个条目
    expect(entries[3]).toMatchObject({ url: "3129518236", name: "", recognized: true });
  });
});

describe("listStreamers", () => {
  it("空行不计入,已识别条目全部返回", () => {
    const withBlank = SAMPLE + "\n\n";
    expect(listStreamers(withBlank)).toHaveLength(4);
  });
});

describe("addStreamer", () => {
  it("追加一行,带名字,末尾补换行", () => {
    const out = addStreamer(SAMPLE, "https://live.douyin.com/999", "新主播");
    expect(out).toContain("https://live.douyin.com/999,主播:新主播");
    expect(out.endsWith("\n")).toBe(true);
    expect(listStreamers(out)).toHaveLength(5);
  });

  it("同 url 已存在则不重复添加", () => {
    const out = addStreamer(SAMPLE, "https://live.douyin.com/90910615050", "改名尝试");
    expect(listStreamers(out)).toHaveLength(4);
  });

  it("空 url 原样返回", () => {
    expect(addStreamer(SAMPLE, "   ")).toBe(SAMPLE);
  });
});

describe("setPausedAt / removeAt / renameAt(按行号,不丢其他行)", () => {
  it("暂停第 2 行(原始传奇)", () => {
    const out = setPausedAt(SAMPLE, 2, true);
    const lines = out.split("\n");
    expect(lines[2]).toBe("#https://live.douyin.com/90910615050,主播:原始传奇");
    // 其他行不变
    expect(lines[0]).toBe("https://union.bytedance.com/open/portal/live_flow/followRoomDetail");
    expect(lines[3]).toBe("3129518236");
  });

  it("恢复被暂停的第 1 行(芝麻)", () => {
    const out = setPausedAt(SAMPLE, 1, false);
    expect(out.split("\n")[1]).toBe("https://live.douyin.com/24144594616,主播:芝麻（赢豆版）");
  });

  it("删除第 2 行后只剩 3 条", () => {
    const out = removeAt(SAMPLE, 2);
    expect(listStreamers(out)).toHaveLength(3);
    expect(out).not.toContain("原始传奇");
  });

  it("改名第 2 行", () => {
    const out = renameAt(SAMPLE, 2, "原始传奇2");
    expect(out.split("\n")[2]).toBe("https://live.douyin.com/90910615050,主播:原始传奇2");
  });

  it("越界行号原样返回", () => {
    expect(setPausedAt(SAMPLE, 99, true)).toBe(SAMPLE);
  });
});
