import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  deleteRecordingFile,
  listAnchorFiles,
  listAnchorFolders,
  statRecording,
} from "@/modules/recording/files";

let dir: string;

async function mkFile(rel: string, size = 4, mtime?: Date) {
  const p = path.join(dir, rel);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, Buffer.alloc(size));
  if (mtime) await fs.utimes(p, mtime, mtime);
}

const OLD = new Date(Date.now() - 60 * 60 * 1000); // 1h 前

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "qjhy-rec-"));
  process.env.RECORDINGS_DIR = dir;
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
  delete process.env.RECORDINGS_DIR;
});

describe("listAnchorFolders", () => {
  it("按总大小降序,统计 ts 文件数与大小,忽略散文件", async () => {
    await mkFile("主播A/a_1.ts", 100, OLD);
    await mkFile("主播A/a_2.ts", 100, OLD);
    await mkFile("主播B/b_1.ts", 500, OLD);
    await mkFile("stray.txt", 10, OLD);
    const folders = await listAnchorFolders();
    expect(folders.map((f) => f.name)).toEqual(["主播B", "主播A"]);
    expect(folders[1]).toMatchObject({ fileCount: 2, totalSize: 200 });
  });
});

describe("listAnchorFiles", () => {
  it("只列 .ts、按 mtime 降序、Screenshots 不算、新文件标 recording", async () => {
    await mkFile("主播A/old.ts", 10, OLD);
    await mkFile("主播A/new.ts", 10); // 刚写,mtime≈now
    await mkFile("主播A/cover.png", 10, OLD);
    await mkFile("主播A/Screenshots/s1.png", 10, OLD);
    const files = await listAnchorFiles("主播A");
    expect(files.map((f) => f.name)).toEqual(["new.ts", "old.ts"]);
    expect(files[0]?.recording).toBe(true);
    expect(files[1]?.recording).toBe(false);
  });

  it("路径穿越被拒", async () => {
    await expect(listAnchorFiles("../etc")).rejects.toThrow();
    await expect(listAnchorFiles("a/b")).rejects.toThrow();
  });
});

describe("deleteRecordingFile", () => {
  it("删除旧文件成功", async () => {
    await mkFile("主播A/old.ts", 10, OLD);
    await deleteRecordingFile("主播A", "old.ts", new Set());
    await expect(statRecording("主播A", "old.ts")).rejects.toThrow();
  });

  it("正在录制的主播禁删", async () => {
    await mkFile("主播A/old.ts", 10, OLD);
    await expect(deleteRecordingFile("主播A", "old.ts", new Set(["主播A"]))).rejects.toThrow(
      /录制中/,
    );
  });

  it("mtime<2分钟禁删(快照拿不到时的兜底)", async () => {
    await mkFile("主播A/fresh.ts", 10);
    await expect(deleteRecordingFile("主播A", "fresh.ts", new Set())).rejects.toThrow(/录制中/);
  });

  it("文件不存在幂等成功", async () => {
    await fs.mkdir(path.join(dir, "主播A"), { recursive: true });
    await expect(deleteRecordingFile("主播A", "gone.ts", new Set())).resolves.toBeUndefined();
  });

  it("非 .ts 文件禁删", async () => {
    await mkFile("主播A/cover.png", 10, OLD);
    await expect(deleteRecordingFile("主播A", "cover.png", new Set())).rejects.toThrow();
  });
});

describe("RECORDINGS_DIR 未配置", () => {
  it("抛错", async () => {
    delete process.env.RECORDINGS_DIR;
    await expect(listAnchorFolders()).rejects.toThrow(/未配置/);
  });
});
