import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, readFile } from "node:fs/promises";
import {
  buildSourcePath,
  buildEditedPath,
  buildFishSourcePath,
  isFishProduct,
  writeFile as nasWriteFile,
  getDownloadStream,
} from "@/modules/editing-storage/nas";

const NAS = "./tmp/editing-nas-test-2";

describe("nas path helpers", () => {
  it("buildSourcePath - normal product", () => {
    const p = buildSourcePath({
      taskId: 42,
      product: "捕鱼大作战",
      materialDate: "2026-05-25",
      originalName: "raw.mp4",
    });
    expect(p).toBe("source/捕鱼大作战-新/task-42-raw.mp4");
  });
  it("buildEditedPath - normal product", () => {
    const p = buildEditedPath({
      taskId: 42,
      product: "途游斗地主",
      materialDate: "2026-05-25",
      originalName: "v1.mp4",
    });
    expect(p).toBe("edited/途游斗地主-新/task-42-v1.mp4");
  });
  it("buildSourcePath - sanitizes filename traversal", () => {
    const p = buildSourcePath({
      taskId: 1,
      product: "捕鱼大作战",
      materialDate: "2026-05-25",
      originalName: "../../etc/passwd",
    });
    expect(p).toBe("source/捕鱼大作战-新/task-1-passwd");
  });
});

describe("buildFishSourcePath", () => {
  it("generates YYYYMMDD-room-anchor-NN.ext format", () => {
    const p = buildFishSourcePath({
      taskId: 10,
      product: "捕鱼大作战",
      materialDate: "2026-05-25",
      originalName: "clip.mp4",
      roomName: "B17",
      anchorName: "小明",
      sequenceNumber: 1,
    });
    expect(p).toBe("source/捕鱼大作战-新/20260525-B17-小明-01.mp4");
  });

  it("pads sequence number to 2 digits", () => {
    const p = buildFishSourcePath({
      taskId: 11,
      product: "捕鱼大作战",
      materialDate: "2026-05-25",
      originalName: "raw.mp4",
      roomName: "A20",
      anchorName: "大壮",
      sequenceNumber: 9,
    });
    expect(p).toBe("source/捕鱼大作战-新/20260525-A20-大壮-09.mp4");
  });

  it("handles sequence number >= 10", () => {
    const p = buildFishSourcePath({
      taskId: 12,
      product: "捕鱼争霸赛",
      materialDate: "2026-05-25",
      originalName: "video.mp4",
      roomName: "C05",
      anchorName: "李梅",
      sequenceNumber: 12,
    });
    expect(p).toBe("source/捕鱼争霸赛-新/20260525-C05-李梅-12.mp4");
  });

  it("handles file without extension", () => {
    const p = buildFishSourcePath({
      taskId: 13,
      product: "捕鱼大作战",
      materialDate: "2026-05-01",
      originalName: "noext",
      roomName: "B17",
      anchorName: "小明",
      sequenceNumber: 1,
    });
    expect(p).toBe("source/捕鱼大作战-新/20260501-B17-小明-01");
  });

  it("sanitizes traversal in originalName for extension extraction", () => {
    const p = buildFishSourcePath({
      taskId: 14,
      product: "捕鱼大作战",
      materialDate: "2026-05-25",
      originalName: "../../etc/passwd.mp4",
      roomName: "B17",
      anchorName: "小明",
      sequenceNumber: 2,
    });
    expect(p).toBe("source/捕鱼大作战-新/20260525-B17-小明-02.mp4");
  });
});

describe("isFishProduct", () => {
  it("returns true when product contains 捕鱼", () => {
    expect(isFishProduct("捕鱼大作战")).toBe(true);
    expect(isFishProduct("捕鱼争霸赛")).toBe(true);
  });

  it("returns false for non-fish products", () => {
    expect(isFishProduct("三国冰河时代")).toBe(false);
    expect(isFishProduct("途游斗地主")).toBe(false);
  });

  it("returns false for null/undefined/empty", () => {
    expect(isFishProduct(null)).toBe(false);
    expect(isFishProduct(undefined)).toBe(false);
    expect(isFishProduct("")).toBe(false);
  });
});

describe("nas IO", () => {
  beforeAll(async () => await mkdir(NAS, { recursive: true }));
  afterAll(async () => await rm(NAS, { recursive: true, force: true }));

  it("writeFile creates file under NAS root", async () => {
    const relPath = "source/test/2026-05-25/task-1-x.txt";
    await nasWriteFile(NAS, relPath, Buffer.from("hello"));
    const content = await readFile(`${NAS}/${relPath}`, "utf8");
    expect(content).toBe("hello");
  });

  it("writeFile rejects paths escaping NAS root", async () => {
    await expect(nasWriteFile(NAS, "../escape.txt", Buffer.from("x"))).rejects.toThrow(
      /outside NAS/,
    );
  });

  it("getDownloadStream returns readable stream", async () => {
    const relPath = "source/test/2026-05-25/task-2-y.txt";
    await nasWriteFile(NAS, relPath, Buffer.from("world"));
    const stream = getDownloadStream(NAS, relPath);
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).toString("utf8")).toBe("world");
  });

  it("getDownloadStream rejects path traversal", () => {
    expect(() => getDownloadStream(NAS, "../escape.txt")).toThrow(/outside NAS/);
  });
});
