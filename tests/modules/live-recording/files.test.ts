import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  deleteRecording,
  listFiles,
  listStreamerFolders,
  readCategories,
  readRetention,
  readUrlsFile,
  statRecording,
  sweepRetention,
  writeCategories,
  writeRetention,
  writeUrlsFile,
} from "@/modules/live-recording/files";

const DAY = 24 * 60 * 60 * 1000;

let root: string;
let urls: string;

async function mkFile(rel: string, size = 8, mtime?: Date) {
  const p = path.join(root, rel);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, Buffer.alloc(size));
  if (mtime) await fs.utimes(p, mtime, mtime);
}

const OLD = new Date(Date.now() - 60 * 60 * 1000); // 1h 前

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "qjhy-rec-"));
  urls = path.join(root, "builtin_urls.txt");
  process.env.RECORDINGS_DIR = root;
  process.env.URLS_FILE = urls;
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
  delete process.env.RECORDINGS_DIR;
  delete process.env.URLS_FILE;
});

describe("listStreamerFolders", () => {
  it("按总大小降序,只统计 .ts,忽略子目录/杂文件", async () => {
    await mkFile("主播A/a1.ts", 100, OLD);
    await mkFile("主播A/a2.ts", 100, OLD);
    await mkFile("主播A/cover.png", 50, OLD);
    await mkFile("主播A/Screenshots/s.png", 50, OLD);
    await mkFile("主播B/b1.ts", 500, OLD);
    const folders = await listStreamerFolders();
    expect(folders.map((f) => f.name)).toEqual(["主播B", "主播A"]);
    expect(folders.find((f) => f.name === "主播A")).toMatchObject({
      fileCount: 2,
      totalSize: 200,
      recording: false,
    });
  });

  it("最新文件 2 分钟内 → recording=true", async () => {
    await mkFile("主播C/fresh.ts", 10); // 刚写,mtime≈now
    const folders = await listStreamerFolders();
    expect(folders[0]).toMatchObject({ name: "主播C", recording: true });
  });
});

describe("listFiles", () => {
  it("只列 .ts、按 mtime 降序、标记 recording", async () => {
    await mkFile("主播A/old.ts", 10, OLD);
    await mkFile("主播A/new.ts", 10);
    await mkFile("主播A/note.txt", 10, OLD);
    const files = await listFiles("主播A");
    expect(files.map((f) => f.name)).toEqual(["new.ts", "old.ts"]);
    expect(files[0]?.recording).toBe(true);
    expect(files[1]?.recording).toBe(false);
  });

  it("同时识别 .mp4(录完转封装)与 .ts,排除非视频文件", async () => {
    await mkFile("主播A/finished.mp4", 100, OLD);
    await mkFile("主播A/recording.ts", 100, OLD);
    await mkFile("主播A/cover.png", 10, OLD);
    await mkFile("主播A/log.txt", 10, OLD);
    const files = await listFiles("主播A");
    expect(files.map((f) => f.name).sort()).toEqual(["finished.mp4", "recording.ts"]);
  });

  it("路径穿越被拒", async () => {
    await expect(listFiles("../etc")).rejects.toThrow();
    await expect(listFiles("a/b")).rejects.toThrow();
  });
});

describe("statRecording", () => {
  it("返回大小与绝对路径", async () => {
    await mkFile("主播A/x.ts", 123, OLD);
    const { size, fullPath } = await statRecording("主播A", "x.ts");
    expect(size).toBe(123);
    expect(fullPath).toContain("主播A");
  });
  it("非 .ts 拒绝", async () => {
    await expect(statRecording("主播A", "x.png")).rejects.toThrow();
  });
});

describe("deleteRecording", () => {
  it("删旧文件成功", async () => {
    await mkFile("主播A/old.ts", 10, OLD);
    await deleteRecording("主播A", "old.ts");
    await expect(statRecording("主播A", "old.ts")).rejects.toThrow();
  });
  it("2 分钟内的文件禁删", async () => {
    await mkFile("主播A/fresh.ts", 10);
    await expect(deleteRecording("主播A", "fresh.ts")).rejects.toThrow(/录制|禁止/);
  });
  it("不存在幂等成功", async () => {
    await fs.mkdir(path.join(root, "主播A"), { recursive: true });
    await expect(deleteRecording("主播A", "gone.ts")).resolves.toBeUndefined();
  });
});

describe("readUrlsFile / writeUrlsFile", () => {
  it("不存在返回空串", async () => {
    expect(await readUrlsFile()).toBe("");
  });
  it("原子写后可读回", async () => {
    await writeUrlsFile("https://live.douyin.com/1,主播:甲\n");
    expect(await readUrlsFile()).toBe("https://live.douyin.com/1,主播:甲\n");
  });
});

describe("readCategories / writeCategories", () => {
  it("不存在返回空结构", async () => {
    expect(await readCategories()).toEqual({ categories: [], byUrl: {} });
  });
  it("写后可读回", async () => {
    await writeCategories({ categories: ["棋牌", "官号"], byUrl: { "https://x/1": "棋牌" } });
    expect(await readCategories()).toEqual({
      categories: ["棋牌", "官号"],
      byUrl: { "https://x/1": "棋牌" },
    });
  });
  it("坏 JSON 返回空结构不崩", async () => {
    await fs.writeFile(path.join(root, ".qjhy-categories.json"), "{ bad json", "utf8");
    expect(await readCategories()).toEqual({ categories: [], byUrl: {} });
  });
});

describe("readRetention / writeRetention", () => {
  it("不存在返回空", async () => {
    expect(await readRetention()).toEqual({ byUrl: {} });
  });
  it("写后可读回,过滤掉 0/负/非法值", async () => {
    await writeRetention({ byUrl: { "https://x/1": 3, "https://x/2": 0, "https://x/3": -5 } });
    expect(await readRetention()).toEqual({ byUrl: { "https://x/1": 3 } });
  });
  it("坏 JSON 不崩", async () => {
    await fs.writeFile(path.join(root, ".qjhy-retention.json"), "{ nope", "utf8");
    expect(await readRetention()).toEqual({ byUrl: {} });
  });
});

describe("sweepRetention", () => {
  it("删除超期录像,保留未到期与永久主播", async () => {
    await writeUrlsFile(
      "https://live.douyin.com/111,主播:甲\nhttps://live.douyin.com/222,主播:乙\n",
    );
    await writeRetention({ byUrl: { "https://live.douyin.com/111": 3 } });
    await mkFile("甲/old.mp4", 100, new Date(Date.now() - 5 * DAY)); // 超期→删
    await mkFile("甲/recent.mp4", 100, new Date(Date.now() - 1 * DAY)); // 未到期→留
    await mkFile("乙/ancient.mp4", 100, new Date(Date.now() - 90 * DAY)); // 永久→留

    const r = await sweepRetention();
    expect(r.deleted).toBe(1);
    expect(r.freedBytes).toBe(100);
    expect(r.items[0]).toMatchObject({ streamer: "甲", file: "old.mp4" });
    expect((await listFiles("甲")).map((f) => f.name)).toEqual(["recent.mp4"]);
    expect((await listFiles("乙")).map((f) => f.name)).toEqual(["ancient.mp4"]);
  });

  it("2 分钟内在写的文件不删", async () => {
    await writeUrlsFile("https://live.douyin.com/111,主播:甲\n");
    await writeRetention({ byUrl: { "https://live.douyin.com/111": 3 } });
    await mkFile("甲/fresh.mp4", 100); // mtime≈now
    const r = await sweepRetention();
    expect(r.deleted).toBe(0);
  });

  it("无主播名(无法定位文件夹)跳过", async () => {
    await writeUrlsFile("https://live.douyin.com/111\n"); // 无 ,主播: 后缀
    await writeRetention({ byUrl: { "https://live.douyin.com/111": 1 } });
    await mkFile("111/old.mp4", 100, new Date(Date.now() - 5 * DAY));
    const r = await sweepRetention();
    expect(r.deleted).toBe(0);
  });
});
