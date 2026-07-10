import { beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { sealPayload } from "@/modules/recording/client";
import { ingestWsMessage, type WsAccumulator } from "@/modules/recording/snapshot";

const key = crypto.randomBytes(32);
const sealMsg = (obj: unknown) =>
  JSON.stringify({ encrypted: sealPayload(Buffer.from(JSON.stringify(obj)), key) });

describe("ingestWsMessage", () => {
  let acc: WsAccumulator;
  beforeEach(() => {
    acc = {};
  });

  it("解密并归集 builtinTasks，返回 true 表示拿到任务帧", () => {
    const done = ingestWsMessage(
      sealMsg({ type: "builtinTasks", payload: [{ room_id: "1", anchor_name: "A" }] }),
      key,
      acc,
    );
    expect(done).toBe(true);
    expect(acc.tasks).toHaveLength(1);
  });

  it("归集 systemStatus.diskFree，不算完成", () => {
    const done = ingestWsMessage(
      sealMsg({ type: "systemStatus", payload: { diskFree: 52684820480 } }),
      key,
      acc,
    );
    expect(done).toBe(false);
    expect(acc.diskFree).toBe(52684820480);
  });

  it("无关消息与坏帧不抛错、不归集", () => {
    expect(ingestWsMessage(sealMsg({ type: "newLog", payload: {} }), key, acc)).toBe(false);
    expect(ingestWsMessage("not-json", key, acc)).toBe(false);
    expect(acc.tasks).toBeUndefined();
  });

  it("明文帧（未加密模式）同样可归集", () => {
    const done = ingestWsMessage(JSON.stringify({ type: "builtinTasks", payload: [] }), key, acc);
    expect(done).toBe(true);
    expect(acc.tasks).toEqual([]);
  });
});
