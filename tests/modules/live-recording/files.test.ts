import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  deleteRecording,
  listFiles,
  listStreamerFolders,
  readUrlsFile,
  statRecording,
  writeUrlsFile,
} from "@/modules/live-recording/files";

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
