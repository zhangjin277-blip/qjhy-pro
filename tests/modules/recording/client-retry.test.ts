import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import {
  RecorderOfflineError,
  recorderRequest,
  resetRecorderSession,
} from "@/modules/recording/client";

/** 模拟 fetch 的 Response:client.ts 只用得到 .text() */
function jsonResponse(body: Record<string, unknown>) {
  return { text: () => Promise.resolve(JSON.stringify(body)) };
}

/** 生成一把可用于 RSA-OAEP 加密的公钥(DER spki base64),供 pubkey 接口 mock 使用 */
function generatePubKeyBase64(): string {
  const { publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  return publicKey.export({ type: "spki", format: "der" }).toString("base64");
}

const pubKeyB64 = generatePubKeyBase64();

/** 依次喂 pubkey → exchange → login 三个握手响应(明文分支,client.ts 本就兼容) */
function queueHandshake(fetchMock: ReturnType<typeof vi.fn>): void {
  fetchMock
    .mockResolvedValueOnce(jsonResponse({ code: 200, data: pubKeyB64 }))
    .mockResolvedValueOnce(jsonResponse({ code: 200, data: { session_id: "sess-test" } }))
    .mockResolvedValueOnce(jsonResponse({ code: 200, data: { token: "t" } }));
}

describe("recorderRequest 401 重握手状态机", () => {
  beforeEach(() => {
    resetRecorderSession();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("首次业务请求 401 → 自动重握手 → 重试成功返回 data", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    queueHandshake(fetchMock); // 1-3: 首次握手(pubkey/exchange/login)
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 401, message: "Session Invalid" })); // 4: 业务请求首次 401
    queueHandshake(fetchMock); // 5-7: 重握手
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 200, data: { quality: "hd" } })); // 8: 重试成功

    const data = await recorderRequest("/api/v1/builtin_recorder/config");

    expect(data).toEqual({ quality: "hd" });
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it("重试后仍 401 → 抛错", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    queueHandshake(fetchMock);
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 401, message: "Session Invalid" }));
    queueHandshake(fetchMock);
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 401, message: "仍未授权" }));

    await expect(recorderRequest("/api/v1/builtin_recorder/config")).rejects.toThrow("仍未授权");
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it("fetch 网络异常 → 抛 RecorderOfflineError", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(recorderRequest("/api/v1/builtin_recorder/config")).rejects.toBeInstanceOf(
      RecorderOfflineError,
    );
  });
});
