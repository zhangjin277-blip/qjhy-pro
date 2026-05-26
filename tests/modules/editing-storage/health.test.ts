import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { checkNasMount } from "@/modules/editing-storage/health";

const TEST_PATH = "./tmp/editing-nas-test";

describe("checkNasMount", () => {
  beforeAll(async () => {
    await mkdir(TEST_PATH, { recursive: true });
  });
  afterAll(async () => {
    await rm(TEST_PATH, { recursive: true, force: true });
  });

  it("returns ok when path exists and is writable", async () => {
    const result = await checkNasMount(TEST_PATH);
    expect(result.ok).toBe(true);
  });

  it("returns not-ok when path does not exist", async () => {
    const result = await checkNasMount("./does-not-exist-12345");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/ENOENT|no such file/i);
  });

  it("returns not-ok when path is not writable", async () => {
    const roPath = `${TEST_PATH}-ro`;
    await mkdir(roPath, { mode: 0o400 });
    try {
      const result = await checkNasMount(roPath);
      expect(result.ok).toBe(false);
    } finally {
      await rm(roPath, { recursive: true, force: true });
    }
  });
});
