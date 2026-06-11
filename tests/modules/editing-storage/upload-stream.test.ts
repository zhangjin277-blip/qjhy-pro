import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  moveTempExclusive,
  moveTempWithSeq,
  parseUploadToTemp,
  removeFile,
} from "@/modules/editing-storage/upload-stream";

let NAS: string;

beforeAll(async () => {
  NAS = await mkdtemp(join(tmpdir(), "qjhy-upload-stream-test-"));
});

afterAll(async () => {
  await rm(NAS, { recursive: true, force: true });
});

/** 在 NAS 根下造一个待 move 的临时文件，返回相对路径 */
async function makeTmpFile(name: string, content: string): Promise<string> {
  const rel = join(".tmp", name);
  await mkdir(join(NAS, ".tmp"), { recursive: true });
  await writeFile(join(NAS, rel), content);
  return rel;
}

describe("moveTempExclusive", () => {
  it("moves temp file to target and preserves content", async () => {
    const tmp = await makeTmpFile("up-aaa", "video-bytes");
    await moveTempExclusive(NAS, tmp, "source/产品-新/20260610-01.mp4");
    expect(await readFile(join(NAS, "source/产品-新/20260610-01.mp4"), "utf8")).toBe("video-bytes");
    // 临时文件已被 move 走
    await expect(stat(join(NAS, tmp))).rejects.toThrow();
  });

  it("throws EEXIST instead of overwriting existing target", async () => {
    const tmp1 = await makeTmpFile("up-bbb", "first");
    const tmp2 = await makeTmpFile("up-ccc", "second");
    await moveTempExclusive(NAS, tmp1, "source/产品-新/collide.mp4");
    // 关键断言：同一目标第二次 move 必须抛 EEXIST，而不是静默覆盖（历史撞车 bug）
    await expect(moveTempExclusive(NAS, tmp2, "source/产品-新/collide.mp4")).rejects.toMatchObject({
      code: "EEXIST",
    });
    // 先到者内容未被破坏
    expect(await readFile(join(NAS, "source/产品-新/collide.mp4"), "utf8")).toBe("first");
  });

  it("rejects paths outside NAS root", async () => {
    const tmp = await makeTmpFile("up-ddd", "x");
    await expect(moveTempExclusive(NAS, tmp, "../escape.mp4")).rejects.toThrow(/outside NAS root/);
  });
});

describe("moveTempWithSeq", () => {
  it("starts at startSeq when no collision", async () => {
    const tmp = await makeTmpFile("up-eee", "v1");
    const rel = await moveTempWithSeq(NAS, tmp, (seq) => `edited/A-新/file-0${seq}.mp4`, 1);
    expect(rel).toBe("edited/A-新/file-01.mp4");
  });

  it("bumps sequence on EEXIST until a free slot", async () => {
    // 预占 seq 1、2（模拟并发对手已落盘）
    await mkdir(join(NAS, "edited/B-新"), { recursive: true });
    await writeFile(join(NAS, "edited/B-新/clip-01.mp4"), "taken-1");
    await writeFile(join(NAS, "edited/B-新/clip-02.mp4"), "taken-2");

    const tmp = await makeTmpFile("up-fff", "mine");
    const rel = await moveTempWithSeq(NAS, tmp, (seq) => `edited/B-新/clip-0${seq}.mp4`, 1);
    expect(rel).toBe("edited/B-新/clip-03.mp4");
    expect(await readFile(join(NAS, rel), "utf8")).toBe("mine");
    // 已存在的文件没有被覆盖
    expect(await readFile(join(NAS, "edited/B-新/clip-01.mp4"), "utf8")).toBe("taken-1");
  });
});

describe("removeFile", () => {
  it("removes file and is idempotent for missing paths", async () => {
    const rel = await makeTmpFile("up-ggg", "x");
    await removeFile(NAS, rel);
    await expect(stat(join(NAS, rel))).rejects.toThrow();
    // 再删一次不报错
    await expect(removeFile(NAS, rel)).resolves.toBeUndefined();
  });
});

describe("parseUploadToTemp", () => {
  function buildRequest(fd: FormData): Request {
    return new Request("http://localhost/api/editing/upload-source", {
      method: "POST",
      body: fd,
    });
  }

  it("streams file to temp, computes md5/bytes, keeps utf8 filename", async () => {
    const fd = new FormData();
    fd.append("taskId", "42");
    fd.append("durationSec", "75");
    fd.append("file", new File(["hello world"], "测试视频.mp4", { type: "video/mp4" }));

    const parsed = await parseUploadToTemp(buildRequest(fd), NAS);
    expect(parsed.fields).toMatchObject({ taskId: "42", durationSec: "75" });
    // defParamCharset: "utf8" —— busboy 默认 latin1 会把中文名解成乱码
    expect(parsed.fileName).toBe("测试视频.mp4");
    expect(parsed.mimeType).toBe("video/mp4");
    expect(parsed.md5).toBe("5eb63bbbe01eeed093cb22bb8f5acdc3"); // md5("hello world")
    expect(parsed.bytes).toBe(11);
    expect(parsed.tmpRelPath.startsWith(".tmp/")).toBe(true);
    expect(await readFile(join(NAS, parsed.tmpRelPath), "utf8")).toBe("hello world");
    await removeFile(NAS, parsed.tmpRelPath);
  });

  it("rejects uploads with more than one file part", async () => {
    const fd = new FormData();
    fd.append("taskId", "1");
    fd.append("file", new File(["aaa"], "a.mp4", { type: "video/mp4" }));
    fd.append("file2", new File(["bbb"], "b.mp4", { type: "video/mp4" }));

    await expect(parseUploadToTemp(buildRequest(fd), NAS)).rejects.toThrow(/单个文件/);
  });

  it("rejects when no file part present", async () => {
    const fd = new FormData();
    fd.append("taskId", "1");
    await expect(parseUploadToTemp(buildRequest(fd), NAS)).rejects.toThrow(/no file part/);
  });

  it("rejects non-multipart requests", async () => {
    const req = new Request("http://localhost/x", { method: "POST", body: "{}" });
    await expect(parseUploadToTemp(req, NAS)).rejects.toThrow(/multipart/);
  });
});
