import { beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { sealPayload } from "@/modules/recording/client";
import {
  ingestWsMessage,
  recordingAnchorNames,
  type WsAccumulator,
} from "@/modules/recording/snapshot";
import type { BuiltinTask, RecorderSnapshot } from "@/modules/recording/types";

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

const baseTask: BuiltinTask = {
  platform: "douyin",
  room_id: "1",
  anchor_name: "A",
  avatar: "",
  quality: "原画",
  status: "录制中",
  update_time: "",
  is_paused: false,
  file_size: "0 B",
  duration: "0",
};

function snapOf(tasks: BuiltinTask[]): RecorderSnapshot {
  return { online: true, tasks, diskFree: null, fetchedAt: Date.now() };
}

describe("recordingAnchorNames", () => {
  it("status=录制中 且 is_paused=false 纳入", () => {
    const names = recordingAnchorNames(snapOf([{ ...baseTask, anchor_name: "A" }]));
    expect(names).toEqual(new Set(["A"]));
  });

  it("status 含“录制中”子串的组合态按 includes 语义纳入", () => {
    const names = recordingAnchorNames(
      snapOf([{ ...baseTask, anchor_name: "B", status: "初始化录制中(转码)" }]),
    );
    expect(names).toEqual(new Set(["B"]));
  });

  it("“断流缓冲中”不含“录制中”子串，排除", () => {
    const names = recordingAnchorNames(
      snapOf([{ ...baseTask, anchor_name: "C", status: "断流缓冲中" }]),
    );
    expect(names.size).toBe(0);
  });

  it("is_paused=true 即使 status 含录制中也排除", () => {
    const names = recordingAnchorNames(
      snapOf([{ ...baseTask, anchor_name: "D", status: "录制中", is_paused: true }]),
    );
    expect(names.size).toBe(0);
  });

  it("“监控中”/“已暂停”排除", () => {
    const names = recordingAnchorNames(
      snapOf([
        { ...baseTask, anchor_name: "E", status: "监控中" },
        { ...baseTask, anchor_name: "F", status: "已暂停" },
      ]),
    );
    expect(names.size).toBe(0);
  });

  it("空 tasks 返回空 Set", () => {
    expect(recordingAnchorNames(snapOf([]))).toEqual(new Set());
  });
});
