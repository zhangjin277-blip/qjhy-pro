import "server-only";
import { getRecorderSession, openPayload, resetRecorderSession } from "./client";
import type { BuiltinTask, RecorderSnapshot } from "./types";

/**
 * 按需 WS 快照:连 /ws/live 收第一帧 builtinTasks(连接建立即推)与 systemStatus,
 * 随后立即断开。5s TTL 进程内缓存防多人同时开页重复连;8s 超时视为离线。
 * 离线时返回最后一次成功快照(online=false),从未成功则空列表。
 */

const CACHE_TTL_MS = 5_000;
const WS_TIMEOUT_MS = 8_000;

export interface WsAccumulator {
  tasks?: BuiltinTask[];
  diskFree?: number;
}

/** 解析一帧 WS 消息归集进 acc;返回 true 表示已拿到 builtinTasks(可以断开) */
export function ingestWsMessage(raw: string, aesKey: Buffer, acc: WsAccumulator): boolean {
  try {
    const outer = JSON.parse(raw) as { encrypted?: string; type?: string; payload?: unknown };
    const msg = outer.encrypted
      ? (JSON.parse(openPayload(outer.encrypted, aesKey).toString("utf8")) as {
          type?: string;
          payload?: unknown;
        })
      : outer;
    if (msg.type === "builtinTasks") {
      acc.tasks = (msg.payload ?? []) as BuiltinTask[];
      return true;
    }
    if (msg.type === "systemStatus") {
      const df = (msg.payload as { diskFree?: number } | undefined)?.diskFree;
      if (typeof df === "number") acc.diskFree = df;
    }
  } catch {
    // 单帧解析失败不致命,等下一帧
  }
  return false;
}

let cache: RecorderSnapshot | null = null;
let inflight: Promise<RecorderSnapshot> | null = null;

async function fetchViaWs(): Promise<RecorderSnapshot> {
  const session = await getRecorderSession();
  const base = (process.env.RECORDER_API_URL ?? "http://172.16.39.61:8080").replace(/^http/, "ws");
  const acc: WsAccumulator = {};

  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(`${base}/ws/live?session_id=${session.sessionId}`);
    const timer = setTimeout(() => {
      ws.close();
      // 超时且一帧任务都没拿到:可能 session 失效,重置下次重握手
      if (!acc.tasks) {
        resetRecorderSession();
        reject(new Error("WS 快照超时"));
      } else {
        resolve();
      }
    }, WS_TIMEOUT_MS);
    ws.onmessage = (ev) => {
      if (ingestWsMessage(String(ev.data), session.aesKey, acc)) {
        // builtinTasks 已到;再等一小拍看 systemStatus 是否同批到达
        setTimeout(() => {
          clearTimeout(timer);
          ws.close();
          resolve();
        }, 150);
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      ws.close();
      reject(new Error("WS 连接失败"));
    };
  });

  return {
    online: true,
    tasks: acc.tasks ?? [],
    diskFree: acc.diskFree ?? null,
    fetchedAt: Date.now(),
  };
}

export async function getRecorderSnapshot(): Promise<RecorderSnapshot> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache;
  if (!inflight) {
    inflight = fetchViaWs()
      .then((snap) => {
        cache = snap;
        return snap;
      })
      .catch(() => {
        const stale: RecorderSnapshot = {
          online: false,
          tasks: cache?.tasks ?? [],
          diskFree: null,
          fetchedAt: Date.now(),
        };
        cache = stale;
        return stale;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** 当前正在录制的主播名集合(delete-file 的录制中保护用) */
export function recordingAnchorNames(snap: RecorderSnapshot): Set<string> {
  return new Set(
    snap.tasks.filter((t) => !t.is_paused && t.status.includes("录制中")).map((t) => t.anchor_name),
  );
}
