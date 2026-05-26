import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, readFile } from "node:fs/promises";
import {
  buildSourcePath,
  buildEditedPath,
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
    expect(p).toBe("source/捕鱼大作战/2026-05-25/task-42-raw.mp4");
  });
  it("buildEditedPath - normal product", () => {
    const p = buildEditedPath({
      taskId: 42,
      product: "途游斗地主",
      materialDate: "2026-05-25",
      originalName: "v1.mp4",
    });
    expect(p).toBe("edited/途游斗地主/2026-05-25/task-42-v1.mp4");
  });
  it("buildSourcePath - sanitizes filename traversal", () => {
    const p = buildSourcePath({
      taskId: 1,
      product: "捕鱼大作战",
      materialDate: "2026-05-25",
      originalName: "../../etc/passwd",
    });
    expect(p).toBe("source/捕鱼大作战/2026-05-25/task-1-passwd");
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
