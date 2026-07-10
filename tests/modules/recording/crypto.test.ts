import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { openPayload, sealPayload } from "@/modules/recording/client";

describe("recording client crypto", () => {
  const key = crypto.randomBytes(32);

  it("seal→open 回环还原明文", () => {
    const plain = JSON.stringify({ username: "admin", password: "admin" });
    const sealed = sealPayload(Buffer.from(plain, "utf8"), key);
    expect(openPayload(sealed, key).toString("utf8")).toBe(plain);
  });

  it("payload 格式 = base64(nonce12 ∥ ct ∥ tag16)", () => {
    const plain = Buffer.from("x");
    const buf = Buffer.from(sealPayload(plain, key), "base64");
    expect(buf.length).toBe(12 + plain.length + 16);
  });

  it("篡改密文抛错", () => {
    const sealed = Buffer.from(sealPayload(Buffer.from("hello"), key), "base64");
    const lastIndex = sealed.length - 1;
    sealed[lastIndex] = (sealed[lastIndex] ?? 0) ^ 0xff;
    expect(() => openPayload(sealed.toString("base64"), key)).toThrow();
  });

  it("密钥不符抛错", () => {
    const sealed = sealPayload(Buffer.from("hello"), key);
    expect(() => openPayload(sealed, crypto.randomBytes(32))).toThrow();
  });
});
