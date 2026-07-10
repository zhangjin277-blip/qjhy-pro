# 直播录制板块(recording)实施 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 NAS 上稳定运行的 go-recorder(go-auto-uploader 2026-03 构建)集成进 QJHY-Pro:新增「直播录制」板块——录制任务管理页 + 录像文件管理页,Go 引擎零改动。

**Architecture:** QJHY 作为控制面:`src/modules/recording/` 通过 go-recorder 的加密 API(RSA-OAEP 握手 + AES-256-GCM)做任务增删/暂停/配置,通过按需 WS 连接拿 `builtinTasks` 状态快照,通过挂载卷直读录像文件(列表/下载/删除)。无新业务表,仅权限种子 migration 0056。

**Tech Stack:** Next.js 16 Server Actions + node:crypto(握手/加解密)+ Node 22 原生 WebSocket + node:fs(文件管理)+ shadcn/ui。

**Spec:** `docs/superpowers/specs/2026-07-10-recording-integration-design.md`(必读,含线上实测事实表)

**项目规则:** main 直接开发,不开分支/worktree。migration 手写 SQL + psql 手动应用。每个 task 完成后走 spec compliance review + code quality review。

## 线上环境事实(实测,写代码前记住)

- `RECORDER_API_URL` = `http://172.16.39.61:8080`,登录 `admin`/`admin`,**加密已开启**(明文 JSON 会被拒)
- 加密:`GET /api/v1/sec/pubkey` → `data` 为 base64 DER(spki)字符串(老构建;新版是 `data.pubkey`,兼容两种)→ 生成 32 字节 AES key → `RSA-OAEP(SHA-256)` 加密 → `POST /api/v1/sec/exchange {enc_key}` → `data.session_id`(24h 有效)
- 之后所有请求:body = `{"encrypted": base64(nonce12 ∥ ciphertext ∥ tag16)}`,header `X-Session-Id`;响应同格式需解密
- 登录:`POST /api/v1/auth/login {username,password}`(加密)→ `data.token`(Bearer,24h)
- WS:`ws://…/ws/live?session_id=<sid>`,**连接建立即推**第一帧,消息为 `{"encrypted":…}` 需 AES-GCM 解密;`builtinTasks` 每 2s 推,`systemStatus`(含 `diskFree`)每 2s 推
- 写接口:`POST /api/v1/builtin_recorder/add {platform, url}`(url 支持整段链接 + `,主播:名字` 后缀;重复添加返回 400)、`POST /api/v1/builtin_recorder/control {action: "pause"|"resume"|"delete", platform, room_id}`、`GET/POST /api/v1/builtin_recorder/config`(BuiltinConfig: quality/segment_time/check_interval/save_path,**POST 是整体覆盖,必须先 GET 合并,勿丢 save_path**)
- 录像目录(宿主):`/volume1/docker/live-recorder/downloads/<主播名>/*.ts` + `Screenshots/` 子目录(不展示)
- 老构建缺 `/api/v1/streamers` 等新接口;**只面向线上构建实现,不升级容器**

## 文件结构

```
src/modules/recording/
  types.ts        BuiltinTask / RecorderSnapshot / RecorderConfig / AnchorFolder / RecordingFile
  schema.ts       Zod 输入校验
  client.ts       加密 API 客户端(握手+session/token 缓存+401 重试一次)
  snapshot.ts     WS 按需快照 + 5s TTL 进程内缓存 + ingestWsMessage 纯函数
  files.ts        录像文件列表/删除(录制中保护)/流
  authz.ts        requireRecordingViewer / requireRecordingWriter
  actions/        fetch-snapshot / add-streamer / control-streamer / update-config / delete-file
  index.ts        client-safe barrel
  server.ts       server-only barrel
  CLAUDE.md       板块须知(Task 10)
src/app/(dashboard)/recording/
  page.tsx  _components/recording-tasks.tsx
  files/page.tsx  files/_components/recording-files.tsx
src/app/api/recording/avatar/route.ts  download/route.ts
src/lib/http/node-stream.ts            nodeStreamToWeb 抽共享(新路由用;既有两处重复不动)
src/db/migrations/0056_recording_permission_seed.sql
scripts/verify-recorder-write-api.mjs
tests/modules/recording/{crypto,snapshot,files,schema}.test.ts
修改: src/modules/permissions/{modules,role-defaults}.ts / src/lib/nav.ts / eslint.config.mjs / CLAUDE.md
```

---

### Task 1: 模块骨架 + 类型 + Zod + 加密 API 客户端

**Files:**
- Create: `src/modules/recording/types.ts`, `src/modules/recording/schema.ts`, `src/modules/recording/client.ts`
- Test: `tests/modules/recording/crypto.test.ts`, `tests/modules/recording/schema.test.ts`

- [ ] **Step 1: 写 types.ts**

```ts
/** go-recorder WS `builtinTasks` 单条任务(线上 2026-03 构建实测字段,勿增删) */
export interface BuiltinTask {
  platform: string;
  room_id: string;
  anchor_name: string;
  avatar: string;
  quality: string;
  /** 录制中 / 监控中 / 已暂停 / 未开播等待中 / 检测异常等待中 / 断流缓冲中 / 初始化中 */
  status: string;
  update_time: string;
  is_paused: boolean;
  /** 该主播累计录像体积(引擎格式化好的字符串,如 "549.43 GB") */
  file_size: string;
  duration: string;
}

export interface RecorderSnapshot {
  online: boolean;
  tasks: BuiltinTask[];
  /** NAS 剩余空间(bytes);快照未含 systemStatus 时为 null */
  diskFree: number | null;
  fetchedAt: number;
}

/** go-recorder BuiltinConfig(POST 覆盖式,更新前必须 GET 合并) */
export interface RecorderConfig {
  quality: string;
  segment_time: number;
  check_interval: number;
  save_path: string;
}

export interface AnchorFolder {
  name: string;
  fileCount: number;
  totalSize: number;
}

export interface RecordingFile {
  name: string;
  size: number;
  mtimeMs: number;
  /** mtime 距今 < 2 分钟,视为正在写入 */
  recording: boolean;
}
```

- [ ] **Step 2: 写 schema.ts**

```ts
import { z } from "zod";

export const AddStreamerInput = z.object({
  /** 直播间链接或房间号;可带 ",主播:名字" 后缀,原样透传给引擎 */
  url: z.string().trim().min(1, "直播间链接不能为空").max(500),
});

export const ControlStreamerInput = z.object({
  action: z.enum(["pause", "resume", "delete"]),
  platform: z.string().trim().min(1),
  roomId: z.string().trim().min(1),
});

export const UpdateRecorderConfigInput = z.object({
  quality: z.enum(["uhd", "hd", "sd"]),
  segment_time: z.number().int().min(0).max(240),
  check_interval: z.number().int().min(10).max(600),
});

export const DeleteRecordingFileInput = z.object({
  anchor: z.string().trim().min(1).max(120),
  file: z.string().trim().min(1).max(300),
});
```

- [ ] **Step 3: 写失败测试 tests/modules/recording/crypto.test.ts**

client.ts 尚不存在,先写测试锁定加解密契约(与 Go 端 `aesGCM.Seal(nonce, nonce, plaintext, nil)` 对齐:payload = base64(nonce12 ∥ ct ∥ tag16);跨语言互通性已由会话验证脚本对线上实证,单测锁格式与回环):

```ts
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
    sealed[sealed.length - 1] ^= 0xff;
    expect(() => openPayload(sealed.toString("base64"), key)).toThrow();
  });

  it("密钥不符抛错", () => {
    const sealed = sealPayload(Buffer.from("hello"), key);
    expect(() => openPayload(sealed, crypto.randomBytes(32))).toThrow();
  });
});
```

- [ ] **Step 4: 跑测试确认失败**

Run: `pnpm vitest run tests/modules/recording/crypto.test.ts`
Expected: FAIL(client.ts 不存在)

- [ ] **Step 5: 写 client.ts**

```ts
import "server-only";
import crypto from "node:crypto";

/**
 * go-recorder 加密 API 客户端。
 * 协议(线上 2026-03 构建实测):RSA-OAEP(SHA-256) 换 32 字节 AES 会话密钥,
 * 之后请求/响应 body 均为 {"encrypted": base64(nonce12 ∥ AES-256-GCM密文 ∥ tag16)},
 * header 带 X-Session-Id;登录后另带 Bearer token。session/token 24h,进程内缓存,
 * 遇 401/解析失败自动重握手重试一次。
 */

const TIMEOUT_MS = 5000;

export class RecorderOfflineError extends Error {
  constructor(cause?: unknown) {
    super("录制器离线或不可达");
    this.name = "RecorderOfflineError";
    this.cause = cause;
  }
}

function baseUrl(): string {
  return process.env.RECORDER_API_URL ?? "http://172.16.39.61:8080";
}

export function sealPayload(plaintext: Buffer, key: Buffer): string {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([nonce, ct, cipher.getAuthTag()]).toString("base64");
}

export function openPayload(sealed: string, key: Buffer): Buffer {
  const buf = Buffer.from(sealed, "base64");
  if (buf.length < 12 + 16) throw new Error("密文长度不足");
  const nonce = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const ct = buf.subarray(12, buf.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

export interface RecorderSession {
  sessionId: string;
  aesKey: Buffer;
  token: string;
}

let cachedSession: RecorderSession | null = null;

/** 测试与 401 重试用:丢弃缓存的会话 */
export function resetRecorderSession(): void {
  cachedSession = null;
}

async function fetchJson(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new RecorderOfflineError(e);
  }
  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`录制器返回非 JSON(HTTP ${res.status}):${text.slice(0, 80)}`);
  }
  return json;
}

async function handshake(): Promise<RecorderSession> {
  // 1. 公钥(老构建 data 是字符串,新版是 {pubkey},兼容两种)
  const pub = await fetchJson("/api/v1/sec/pubkey");
  const data = pub.data as string | { pubkey: string };
  const pubB64 = typeof data === "string" ? data : data.pubkey;
  const publicKey = crypto.createPublicKey({
    key: Buffer.from(pubB64, "base64"),
    format: "der",
    type: "spki",
  });

  // 2. 换 AES 会话密钥
  const aesKey = crypto.randomBytes(32);
  const encKey = crypto.publicEncrypt(
    { key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    aesKey,
  );
  const ex = await fetchJson("/api/v1/sec/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enc_key: encKey.toString("base64") }),
  });
  const sessionId = (ex.data as { session_id?: string } | undefined)?.session_id;
  if (!sessionId) throw new Error("录制器握手失败:未返回 session_id");

  // 3. 登录拿 Bearer token
  const user = process.env.RECORDER_ADMIN_USER ?? "admin";
  const pass = process.env.RECORDER_ADMIN_PASS ?? "admin";
  const loginRaw = await fetchJson("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Session-Id": sessionId },
    body: JSON.stringify({
      encrypted: sealPayload(Buffer.from(JSON.stringify({ username: user, password: pass })), aesKey),
    }),
  });
  const login = loginRaw.encrypted
    ? (JSON.parse(openPayload(loginRaw.encrypted as string, aesKey).toString("utf8")) as {
        data?: { token?: string };
      })
    : (loginRaw as { data?: { token?: string } });
  const token = login.data?.token;
  if (!token) throw new Error("录制器登录失败:请检查 RECORDER_ADMIN_USER/PASS");

  return { sessionId, aesKey, token };
}

export async function getRecorderSession(): Promise<RecorderSession> {
  if (cachedSession) return cachedSession;
  cachedSession = await handshake();
  return cachedSession;
}

interface RecorderResponse<T> {
  code: number;
  message?: string;
  data?: T;
}

async function requestOnce<T>(
  session: RecorderSession,
  path: string,
  body?: Record<string, unknown>,
): Promise<RecorderResponse<T>> {
  const raw = await fetchJson(path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": session.sessionId,
      Authorization: `Bearer ${session.token}`,
    },
    ...(body !== undefined
      ? { body: JSON.stringify({ encrypted: sealPayload(Buffer.from(JSON.stringify(body)), session.aesKey) }) }
      : {}),
  });
  const plain = raw.encrypted
    ? (JSON.parse(openPayload(raw.encrypted as string, session.aesKey).toString("utf8")) as RecorderResponse<T>)
    : (raw as unknown as RecorderResponse<T>);
  return plain;
}

/**
 * 调 go-recorder 受保护 API。body 为 undefined 时 GET,否则 POST(加密装箱)。
 * session 失效(401/Session Invalid)自动重握手重试一次;业务错误(code!==200)抛 Error(message)。
 */
export async function recorderRequest<T = unknown>(
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const session = await getRecorderSession();
  let resp: RecorderResponse<T>;
  try {
    resp = await requestOnce<T>(session, path, body);
  } catch (e) {
    if (e instanceof RecorderOfflineError) throw e;
    // 解密失败/非 JSON:多半 session 过期,重握手一次
    resetRecorderSession();
    resp = await requestOnce<T>(await getRecorderSession(), path, body);
  }
  if (resp.code === 401 || /session invalid/i.test(resp.message ?? "")) {
    resetRecorderSession();
    resp = await requestOnce<T>(await getRecorderSession(), path, body);
  }
  if (resp.code !== 200) throw new Error(resp.message ?? `录制器返回错误(code ${resp.code})`);
  return resp.data as T;
}
```

- [ ] **Step 6: 写 schema 测试 tests/modules/recording/schema.test.ts**

```ts
import { describe, expect, it } from "vitest";
import {
  AddStreamerInput,
  ControlStreamerInput,
  DeleteRecordingFileInput,
  UpdateRecorderConfigInput,
} from "@/modules/recording/schema";

describe("recording schemas", () => {
  it("AddStreamerInput 去空白、拒空串", () => {
    expect(AddStreamerInput.parse({ url: " https://live.douyin.com/123 " }).url).toBe(
      "https://live.douyin.com/123",
    );
    expect(() => AddStreamerInput.parse({ url: "  " })).toThrow();
  });

  it("ControlStreamerInput 只收三种 action", () => {
    expect(() =>
      ControlStreamerInput.parse({ action: "nuke", platform: "Douyin", roomId: "1" }),
    ).toThrow();
  });

  it("UpdateRecorderConfigInput 边界", () => {
    expect(() =>
      UpdateRecorderConfigInput.parse({ quality: "uhd", segment_time: -1, check_interval: 30 }),
    ).toThrow();
    expect(() =>
      UpdateRecorderConfigInput.parse({ quality: "4k", segment_time: 0, check_interval: 30 }),
    ).toThrow();
  });

  it("DeleteRecordingFileInput 必填", () => {
    expect(() => DeleteRecordingFileInput.parse({ anchor: "a", file: "" })).toThrow();
  });
});
```

- [ ] **Step 7: 跑两个测试确认通过**

Run: `pnpm vitest run tests/modules/recording/`
Expected: PASS 全绿

- [ ] **Step 8: Commit**

```bash
git add src/modules/recording tests/modules/recording
git commit -m "feat(recording): 模块骨架+类型+Zod+go-recorder 加密 API 客户端"
```

---

### Task 2: 线上写接口验证脚本(spec「实施验证」条款,必须先于任何 UI)

**Files:**
- Create: `scripts/verify-recorder-write-api.mjs`(自包含,不 import TS 模块,留作运维排查工具)

- [ ] **Step 1: 写脚本**

```js
// 对线上 go-recorder 验证写接口(add→control delete 往返),用假房间号,不影响真实录制任务。
// 用法: RECORDER_API_URL=http://172.16.39.61:8080 node scripts/verify-recorder-write-api.mjs
import crypto from "node:crypto";

const BASE = process.env.RECORDER_API_URL ?? "http://172.16.39.61:8080";
const USER = process.env.RECORDER_ADMIN_USER ?? "admin";
const PASS = process.env.RECORDER_ADMIN_PASS ?? "admin";
const FAKE_ROOM = "999999999999"; // 假房间号:引擎会开始轮询但永远查不到开播,验证完立即删除

const seal = (obj, key) => {
  const nonce = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, nonce);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return Buffer.concat([nonce, ct, c.getAuthTag()]).toString("base64");
};
const open = (b64, key) => {
  const buf = Buffer.from(b64, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(buf.length - 16));
  return JSON.parse(
    Buffer.concat([d.update(buf.subarray(12, buf.length - 16)), d.final()]).toString("utf8"),
  );
};

const pub = await (await fetch(`${BASE}/api/v1/sec/pubkey`)).json();
const pubB64 = typeof pub.data === "string" ? pub.data : pub.data.pubkey;
const publicKey = crypto.createPublicKey({
  key: Buffer.from(pubB64, "base64"), format: "der", type: "spki",
});
const aesKey = crypto.randomBytes(32);
const encKey = crypto.publicEncrypt(
  { key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
  aesKey,
);
const ex = await (await fetch(`${BASE}/api/v1/sec/exchange`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ enc_key: encKey.toString("base64") }),
})).json();
const sid = ex.data.session_id;

const call = async (path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json", "X-Session-Id": sid,
      ...(call.token ? { Authorization: `Bearer ${call.token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify({ encrypted: seal(body, aesKey) }) } : {}),
  });
  if (res.status === 404) throw new Error(`404: ${path} 在该构建不存在——按 spec 回退条款停止,汇报用户`);
  const raw = await res.json();
  return raw.encrypted ? open(raw.encrypted, aesKey) : raw;
};

const login = await call("/api/v1/auth/login", { username: USER, password: PASS });
call.token = login.data.token;
console.log("[1] login OK");

const added = await call("/api/v1/builtin_recorder/add", {
  platform: "Douyin", url: `https://live.douyin.com/${FAKE_ROOM},主播:QJHY接口验证-勿动`,
});
if (added.code !== 200) throw new Error(`add 失败: ${added.message}`);
console.log("[2] add OK");

// WS 确认任务出现
const tasks = await new Promise((resolve, reject) => {
  const ws = new WebSocket(`${BASE.replace("http", "ws")}/ws/live?session_id=${sid}`);
  const t = setTimeout(() => { ws.close(); reject(new Error("WS 8s 超时")); }, 8000);
  ws.onmessage = (ev) => {
    try {
      const outer = JSON.parse(String(ev.data));
      const msg = outer.encrypted ? open(outer.encrypted, aesKey) : outer;
      if (msg.type === "builtinTasks") { clearTimeout(t); ws.close(); resolve(msg.payload ?? []); }
    } catch { /* 忽略无法解析的帧 */ }
  };
  ws.onerror = (e) => { clearTimeout(t); reject(e); };
});
const found = tasks.some((x) => x.room_id === FAKE_ROOM);
console.log(`[3] builtinTasks 含假房间: ${found}`);
if (!found) throw new Error("add 后快照未出现该任务");

const del = await call("/api/v1/builtin_recorder/control", {
  action: "delete", platform: "Douyin", room_id: FAKE_ROOM,
});
if (del.code !== 200) throw new Error(`delete 失败: ${del.message}`);
console.log("[4] delete OK — 写接口验证通过 ✅");
```

- [ ] **Step 2: 跑脚本**

Run: `node scripts/verify-recorder-write-api.mjs`
Expected: 依次输出 `[1] login OK`、`[2] add OK`、`[3] builtinTasks 含假房间: true`、`[4] delete OK — 写接口验证通过 ✅`

**若任一步 404**:立即停止后续所有 task,向用户汇报(spec 回退条款:评估直写 urls.txt 或经批准升级容器,不得擅自升级)。

- [ ] **Step 3: 二次确认清理干净**

Run: `node scripts/verify-recorder-write-api.mjs` 之后再手动跑一次 WS 快照脚本或直接重跑本脚本到第[3]步前中断,确认 `QJHY接口验证-勿动` 不在列表。最简单:重跑整个脚本应再次成功(说明上次删干净了,没触发重复添加 400)。
Expected: 重跑全绿

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-recorder-write-api.mjs
git commit -m "chore(recording): go-recorder 写接口线上验证脚本(add/control 往返)"
```

---

### Task 3: snapshot.ts(WS 按需快照 + TTL 缓存)

**Files:**
- Create: `src/modules/recording/snapshot.ts`
- Test: `tests/modules/recording/snapshot.test.ts`

- [ ] **Step 1: 写失败测试(纯函数部分)**

```ts
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

  it("解密并归集 builtinTasks,返回 true 表示拿到任务帧", () => {
    const done = ingestWsMessage(
      sealMsg({ type: "builtinTasks", payload: [{ room_id: "1", anchor_name: "A" }] }),
      key,
      acc,
    );
    expect(done).toBe(true);
    expect(acc.tasks).toHaveLength(1);
  });

  it("归集 systemStatus.diskFree,不算完成", () => {
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

  it("明文帧(未加密模式)同样可归集", () => {
    const done = ingestWsMessage(
      JSON.stringify({ type: "builtinTasks", payload: [] }),
      key,
      acc,
    );
    expect(done).toBe(true);
    expect(acc.tasks).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/modules/recording/snapshot.test.ts`
Expected: FAIL(snapshot.ts 不存在)

- [ ] **Step 3: 写 snapshot.ts**

```ts
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run tests/modules/recording/snapshot.test.ts`
Expected: PASS

- [ ] **Step 5: 手动集成验证(对线上)**

写临时脚本 `$CLAUDE_JOB_DIR/tmp/snap-check.mjs` 不入库,或直接 `pnpm tsx -e`(若项目有 tsx)调用 `getRecorderSnapshot()`。因 client.ts 有 `server-only` 保护,最简单方式:跳过——Task 8 页面首屏就是集成验证点;此处仅确认单测绿即可。
Expected: 跳过,记录在 task 汇报里

- [ ] **Step 6: Commit**

```bash
git add src/modules/recording/snapshot.ts tests/modules/recording/snapshot.test.ts
git commit -m "feat(recording): WS 按需快照+TTL 缓存+录制中主播集合"
```

---

### Task 4: 权限注册(modules/role-defaults/migration 0056)+ authz.ts

**Files:**
- Modify: `src/modules/permissions/modules.ts`, `src/modules/permissions/role-defaults.ts`
- Create: `src/db/migrations/0056_recording_permission_seed.sql`, `src/modules/recording/authz.ts`
- Test: `tests/modules/recording/role-defaults.test.ts`

- [ ] **Step 1: modules.ts 增加 recording**

`MODULE_KEYS` 数组末尾(`"software_library"` 之后)加 `"recording"`;`MODULE_LABEL` 加 `recording: "直播录制"`;`MODULE_DESC` 加 `recording: "直播录制任务与录像文件管理"`。

- [ ] **Step 2: role-defaults.ts 加特例(照 software_library 写法,四字段显式)**

在 `ROLE_DEFAULTS_SEED` 的 flatMap 里、software_library 特例展开之后追加:

```ts
    // 直播录制:全员可见可下载(scope=all);任务增删/暂停、删录像仅总监/老板(与 0056 种子一致)。
    // 同软件库:必须显式覆盖全部权限字段,防运营岗 base can_edit=true 泄漏管理权。
    ...(module === "recording"
      ? {
          scope: "all" as const,
          can_edit: row.position === "总监" || row.position === "老板",
          can_export: false,
          can_admin: row.position === "总监" || row.position === "老板",
          description: "直播录制:全员可看可下载,管理员可控制/删文件",
        }
      : {}),
```

- [ ] **Step 3: 写失败测试 tests/modules/recording/role-defaults.test.ts**

```ts
import { describe, expect, it } from "vitest";
import { ROLE_DEFAULTS_SEED } from "@/modules/permissions/role-defaults";

describe("recording 权限种子", () => {
  const rows = ROLE_DEFAULTS_SEED.filter((r) => r.module === "recording");

  it("每个岗位都有 recording 行", () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBe(new Set(rows.map((r) => r.position)).size);
  });

  it("全员 scope=all,can_export 关死", () => {
    for (const r of rows) {
      expect(r.scope).toBe("all");
      expect(r.can_export).toBe(false);
    }
  });

  it("仅总监/老板有 can_edit 与 can_admin", () => {
    for (const r of rows) {
      const isBoss = r.position === "总监" || r.position === "老板";
      expect(r.can_edit).toBe(isBoss);
      expect(r.can_admin).toBe(isBoss);
    }
  });
});
```

- [ ] **Step 4: 跑测试**

Run: `pnpm vitest run tests/modules/recording/role-defaults.test.ts`
Expected: Step 1/2 已做则 PASS(先写实现后写测试的顺序在这里可接受——种子是声明式数据,测试锁不变量)

- [ ] **Step 5: 写 migration 0056(照 0055 模板)**

`src/db/migrations/0056_recording_permission_seed.sql`:

```sql
-- 直播录制权限种子:全员 scope=all(可看可下载),仅总监/老板可控制任务/删录像。
-- 岗位清单从现有 role_default_permission 行派生,新岗位以后走 UI 配置。
-- 应用方式:docker exec -i qjhy-postgres psql -U qjhy -d qjhy < src/db/migrations/0056_recording_permission_seed.sql
INSERT INTO "role_default_permission"
  (position, module, scope, can_edit, can_export, can_admin, description, updated_at)
SELECT p.position,
       'recording',
       'all',
       p.position IN ('总监', '老板'),
       false,
       p.position IN ('总监', '老板'),
       '直播录制:全员可看可下载,管理员可控制/删文件',
       now()
  FROM (SELECT DISTINCT position FROM "role_default_permission") p
    ON CONFLICT (position, module) DO NOTHING;
```

- [ ] **Step 6: 本地应用 migration 并验证**

Run: `docker exec -i qjhy-postgres psql -U qjhy -d qjhy < src/db/migrations/0056_recording_permission_seed.sql && docker exec qjhy-postgres psql -U qjhy -d qjhy -c "SELECT position, scope, can_edit FROM role_default_permission WHERE module='recording' ORDER BY position;"`
Expected: INSERT 0 N(N=岗位数,约 8);查询返回每岗位一行,scope 全 all,仅总监/老板 can_edit=t

- [ ] **Step 7: 写 authz.ts(照 software-library/authz.ts)**

```ts
import "server-only";
import { requireUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import type { ResolvedPermission } from "@/modules/permissions";

/**
 * 直播录制鉴权。
 *  - 浏览状态/浏览下载录像:scope !== "none"(默认全员)
 *  - 任务增删/暂停/改配置/删录像:can_edit(默认总监/老板,可在权限页单独授权)
 */
const MODULE = "recording" as const;

export async function requireRecordingViewer(): Promise<{
  userId: string;
  perm: ResolvedPermission;
}> {
  const { userId } = await requireUser();
  const perm = await resolvePermission(userId, MODULE);
  if (perm.scope === "none") throw new Error("无直播录制访问权限");
  return { userId, perm };
}

export async function requireRecordingWriter(): Promise<{
  userId: string;
  perm: ResolvedPermission;
}> {
  const { userId } = await requireUser();
  const perm = await resolvePermission(userId, MODULE);
  if (!perm.can_edit) throw new Error("无直播录制管理权限");
  return { userId, perm };
}
```

- [ ] **Step 8: 全量测试(权限相关既有测试不能被 MODULE_KEYS 变更打破)**

Run: `pnpm typecheck && pnpm vitest run tests/modules/permissions tests/modules/recording`
Expected: PASS。若 permissions 既有测试对 MODULE_KEYS 数量有断言,按既有测试语义更新(参考软件库入册时同类改动)。

- [ ] **Step 9: Commit**

```bash
git add src/modules/permissions src/modules/recording/authz.ts src/db/migrations/0056_recording_permission_seed.sql tests/modules/recording/role-defaults.test.ts
git commit -m "feat(recording): 权限入册(recording module key)+种子 0056+authz 守卫"
```

---

### Task 5: files.ts(录像文件列表/删除保护/读流)

**Files:**
- Create: `src/modules/recording/files.ts`
- Test: `tests/modules/recording/files.test.ts`

- [ ] **Step 1: 写失败测试(tmp fixture,参考 tests/modules/material-library/storage.test.ts 的临时目录风格)**

```ts
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
    expect(files[0].recording).toBe(true);
    expect(files[1].recording).toBe(false);
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run tests/modules/recording/files.test.ts`
Expected: FAIL(files.ts 不存在)

- [ ] **Step 3: 写 files.ts**

```ts
import "server-only";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import type { AnchorFolder, RecordingFile } from "./types";

/**
 * 录像文件直读(挂载卷 RECORDINGS_DIR,生产 /mnt/recordings)。
 * go-recorder 落盘结构:<RECORDINGS_DIR>/<主播名>/<文件>.ts + Screenshots/ 子目录(截图,不展示)。
 * 删除是物理删除(目的即释放 NAS 空间);录制中保护见 deleteRecordingFile。
 */

const RECORDING_GRACE_MS = 2 * 60 * 1000;

function rootDir(): string {
  const d = process.env.RECORDINGS_DIR;
  if (!d) throw new Error("RECORDINGS_DIR 未配置");
  return d;
}

/** 主播名/文件名只允许单层(防路径穿越):不含分隔符、不为 . / .. */
function assertSafeName(name: string): void {
  if (
    !name ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\0")
  ) {
    throw new Error("非法路径");
  }
}

export async function listAnchorFolders(): Promise<AnchorFolder[]> {
  const root = rootDir();
  const entries = await fs.readdir(root, { withFileTypes: true });
  const folders: AnchorFolder[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    let fileCount = 0;
    let totalSize = 0;
    const files = await fs.readdir(path.join(root, e.name), { withFileTypes: true });
    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith(".ts")) continue;
      const st = await fs.stat(path.join(root, e.name, f.name)).catch(() => null);
      if (!st) continue;
      fileCount += 1;
      totalSize += st.size;
    }
    folders.push({ name: e.name, fileCount, totalSize });
  }
  return folders.sort((a, b) => b.totalSize - a.totalSize);
}

export async function listAnchorFiles(anchor: string): Promise<RecordingFile[]> {
  assertSafeName(anchor);
  const dir = path.join(rootDir(), anchor);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const now = Date.now();
  const files: RecordingFile[] = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".ts")) continue;
    const st = await fs.stat(path.join(dir, e.name)).catch(() => null);
    if (!st) continue;
    files.push({
      name: e.name,
      size: st.size,
      mtimeMs: st.mtimeMs,
      recording: now - st.mtimeMs < RECORDING_GRACE_MS,
    });
  }
  return files.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export async function statRecording(
  anchor: string,
  file: string,
): Promise<{ size: number; fullPath: string }> {
  assertSafeName(anchor);
  assertSafeName(file);
  const fullPath = path.join(rootDir(), anchor, file);
  const st = await fs.stat(fullPath);
  if (!st.isFile()) throw new Error("不是文件");
  return { size: st.size, fullPath };
}

export function getRecordingStream(
  fullPath: string,
  range?: { start: number; end: number },
): NodeJS.ReadableStream {
  return createReadStream(fullPath, range);
}

/**
 * 物理删除录像。保护:① 该主播在快照中正在录制 → 拒;② 文件 mtime < 2 分钟 → 拒
 * (快照不可得时仅靠 ② 兜底)。文件已不存在视为幂等成功。仅允许 .ts。
 */
export async function deleteRecordingFile(
  anchor: string,
  file: string,
  recordingAnchors: Set<string>,
): Promise<void> {
  assertSafeName(anchor);
  assertSafeName(file);
  if (!file.endsWith(".ts")) throw new Error("只允许删除 .ts 录像文件");
  if (recordingAnchors.has(anchor)) throw new Error("该主播正在录制中,禁止删除其文件");

  const fullPath = path.join(rootDir(), anchor, file);
  let st;
  try {
    st = await fs.stat(fullPath);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return; // 幂等
    throw e;
  }
  if (Date.now() - st.mtimeMs < RECORDING_GRACE_MS) {
    throw new Error("文件 2 分钟内仍在写入(疑似录制中),禁止删除");
  }
  await fs.unlink(fullPath);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run tests/modules/recording/files.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/recording/files.ts tests/modules/recording/files.test.ts
git commit -m "feat(recording): 录像文件直读——列表/录制中保护删除/读流"
```

---

### Task 6: Server Actions + 双入口 barrel + ESLint zone

**Files:**
- Create: `src/modules/recording/actions/fetch-snapshot.ts`, `actions/add-streamer.ts`, `actions/control-streamer.ts`, `actions/update-config.ts`, `actions/delete-file.ts`, `src/modules/recording/index.ts`, `src/modules/recording/server.ts`
- Modify: `eslint.config.mjs`

- [ ] **Step 1: actions/fetch-snapshot.ts(viewer 级,任务页轮询用)**

```ts
"use server";
import { requireRecordingViewer } from "../authz";
import { getRecorderSnapshot } from "../snapshot";
import type { RecorderSnapshot } from "../types";

export async function fetchRecorderSnapshot(): Promise<RecorderSnapshot> {
  await requireRecordingViewer();
  return getRecorderSnapshot();
}
```

- [ ] **Step 2: actions/add-streamer.ts**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireRecordingWriter } from "../authz";
import { recorderRequest } from "../client";
import { AddStreamerInput } from "../schema";

/** 添加录制主播。url 支持整段直播间链接(可带 ",主播:名字" 后缀),platform 兜底 Douyin。 */
export async function addStreamer(input: unknown): Promise<{ ok: true }> {
  const data = AddStreamerInput.parse(input);
  await requireRecordingWriter();
  await recorderRequest("/api/v1/builtin_recorder/add", { platform: "Douyin", url: data.url });
  revalidatePath("/recording");
  return { ok: true };
}
```

- [ ] **Step 3: actions/control-streamer.ts**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireRecordingWriter } from "../authz";
import { recorderRequest } from "../client";
import { ControlStreamerInput } from "../schema";

/** 暂停/恢复/删除单个录制任务(引擎状态机动作,删除不影响已落盘文件)。 */
export async function controlStreamer(input: unknown): Promise<{ ok: true }> {
  const data = ControlStreamerInput.parse(input);
  await requireRecordingWriter();
  await recorderRequest("/api/v1/builtin_recorder/control", {
    action: data.action,
    platform: data.platform,
    room_id: data.roomId,
  });
  revalidatePath("/recording");
  return { ok: true };
}
```

- [ ] **Step 4: actions/update-config.ts(先 GET 合并,保 save_path)**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireRecordingWriter } from "../authz";
import { recorderRequest } from "../client";
import { UpdateRecorderConfigInput } from "../schema";
import type { RecorderConfig } from "../types";

/** 更新全局录制配置。引擎 POST 是整体覆盖,必须先 GET 合并防丢 save_path。 */
export async function updateRecorderConfig(input: unknown): Promise<{ ok: true }> {
  const data = UpdateRecorderConfigInput.parse(input);
  await requireRecordingWriter();
  const current = await recorderRequest<RecorderConfig>("/api/v1/builtin_recorder/config");
  await recorderRequest("/api/v1/builtin_recorder/config", {
    ...current,
    quality: data.quality,
    segment_time: data.segment_time,
    check_interval: data.check_interval,
  });
  revalidatePath("/recording");
  return { ok: true };
}
```

- [ ] **Step 5: actions/delete-file.ts(录制中保护接快照)**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireRecordingWriter } from "../authz";
import { deleteRecordingFile } from "../files";
import { getRecorderSnapshot, recordingAnchorNames } from "../snapshot";
import { DeleteRecordingFileInput } from "../schema";

/** 物理删除录像文件。录制中保护:快照主播集合 + mtime 兜底(见 files.ts)。 */
export async function deleteRecording(input: unknown): Promise<{ ok: true }> {
  const data = DeleteRecordingFileInput.parse(input);
  await requireRecordingWriter();
  const snap = await getRecorderSnapshot(); // 离线时返回 online=false,集合可能为空,mtime 规则兜底
  await deleteRecordingFile(data.anchor, data.file, recordingAnchorNames(snap));
  revalidatePath("/recording/files");
  return { ok: true };
}
```

- [ ] **Step 6: index.ts(client-safe)与 server.ts**

`src/modules/recording/index.ts`:

```ts
export type {
  AnchorFolder,
  BuiltinTask,
  RecorderConfig,
  RecorderSnapshot,
  RecordingFile,
} from "./types";
export {
  AddStreamerInput,
  ControlStreamerInput,
  DeleteRecordingFileInput,
  UpdateRecorderConfigInput,
} from "./schema";
export { fetchRecorderSnapshot } from "./actions/fetch-snapshot";
export { addStreamer } from "./actions/add-streamer";
export { controlStreamer } from "./actions/control-streamer";
export { updateRecorderConfig } from "./actions/update-config";
export { deleteRecording } from "./actions/delete-file";
```

`src/modules/recording/server.ts`:

```ts
import "server-only";
export { requireRecordingViewer, requireRecordingWriter } from "./authz";
export { getRecorderSnapshot, recordingAnchorNames } from "./snapshot";
export { recorderRequest, RecorderOfflineError } from "./client";
export {
  deleteRecordingFile,
  getRecordingStream,
  listAnchorFiles,
  listAnchorFolders,
  statRecording,
} from "./files";
```

- [ ] **Step 7: eslint.config.mjs 注册 zone(照 software-library 那条,第 220-230 行附近)**

在 zones 数组追加:

```js
      {
        target: [
          "./src/app/**",
          "./src/components/**",
          "./src/lib/**",
          "./src/worker/**",
          "./src/modules/!(recording)/**",
        ],
        from: "./src/modules/recording/!(index|server).ts",
        message: "跨模块只允许 import 对方的 index.ts。server-only 逻辑走 server.ts。",
      },
```

(message 文案以文件里 software-library 条目的原文为准,保持一致。)

- [ ] **Step 8: 验证**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run tests/modules/recording`
Expected: 全过

- [ ] **Step 9: Commit**

```bash
git add src/modules/recording eslint.config.mjs
git commit -m "feat(recording): Server Actions(增删/暂停/配置/删文件)+双入口 barrel+eslint zone"
```

---

### Task 7: API routes(avatar 转发 + 录像下载 Range)+ nodeStreamToWeb 抽共享

**Files:**
- Create: `src/lib/http/node-stream.ts`, `src/app/api/recording/avatar/route.ts`, `src/app/api/recording/download/route.ts`

- [ ] **Step 1: 抽 src/lib/http/node-stream.ts**

把 `src/app/api/software/download/route.ts:102-143` 的 `nodeStreamToWeb`(含注释)原样搬到新文件并 export;**不改动** software/materials 两处既有副本(收敛另行处理,不在本板块 scope)。

```ts
import { Readable } from "node:stream";

/**
 * Node fs 流 → Web ReadableStream 健壮桥接(与 software/materials download 同款):
 * cancel 时销毁底层流、enqueue 包 try/catch 兜底竞态、背压避免大文件全进内存。
 */
export function nodeStreamToWeb(node: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  const nodeReadable = node as Readable;
  let canceled = false;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeReadable.on("data", (chunk: Buffer) => {
        if (canceled) return;
        try {
          controller.enqueue(new Uint8Array(chunk));
        } catch {
          canceled = true;
          nodeReadable.destroy();
          return;
        }
        if ((controller.desiredSize ?? 1) <= 0) nodeReadable.pause();
      });
      nodeReadable.on("end", () => {
        if (canceled) return;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
      nodeReadable.on("error", (err) => {
        if (canceled) return;
        try {
          controller.error(err);
        } catch {
          /* already errored */
        }
      });
    },
    pull() {
      nodeReadable.resume();
    },
    cancel() {
      canceled = true;
      nodeReadable.destroy();
    },
  });
}
```

- [ ] **Step 2: avatar 转发 route**

`src/app/api/recording/avatar/route.ts`——builtinTasks 的 avatar 是录制器上的相对路径(`/api/v1/builtin_recorder/proxy_image?url=…` 或 `/covers/…`),浏览器不直连录制器,QJHY 服务端转发:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireRecordingViewer } from "@/modules/recording/server";

export const runtime = "nodejs";

const ALLOWED_PREFIXES = ["/api/v1/builtin_recorder/proxy_image", "/covers/"];

export async function GET(req: NextRequest) {
  try {
    await requireRecordingViewer();
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : "Forbidden", { status: 403 });
  }

  const src = req.nextUrl.searchParams.get("src") ?? "";
  if (!ALLOWED_PREFIXES.some((p) => src.startsWith(p))) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const base = process.env.RECORDER_API_URL ?? "http://172.16.39.61:8080";
  let upstream: Response;
  try {
    upstream = await fetch(`${base}${src}`, { signal: AbortSignal.timeout(5000) });
  } catch {
    return new NextResponse("Recorder Offline", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) return new NextResponse("Not Found", { status: 404 });

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": "private, max-age=300",
    },
  });
}
```

- [ ] **Step 3: 录像下载 route(Range 支持,照 software download 模式)**

`src/app/api/recording/download/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import {
  getRecordingStream,
  requireRecordingViewer,
  statRecording,
} from "@/modules/recording/server";
import { nodeStreamToWeb } from "@/lib/http/node-stream";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireRecordingViewer();
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : "Forbidden", { status: 403 });
  }

  const anchor = req.nextUrl.searchParams.get("anchor") ?? "";
  const file = req.nextUrl.searchParams.get("file") ?? "";
  if (!anchor || !file) return new NextResponse("Bad Request", { status: 400 });

  let size: number;
  let fullPath: string;
  try {
    ({ size, fullPath } = await statRecording(anchor, file));
  } catch {
    return new NextResponse("文件不存在", { status: 404 });
  }

  // RFC 6266:filename* 让非 Chromium 浏览器正确还原中文文件名
  const enc = encodeURIComponent(file);
  const disposition = `attachment; filename="${enc}"; filename*=UTF-8''${enc}`;

  const rangeHeader = req.headers.get("range");
  const rangeMatch = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;
  if (rangeMatch) {
    const hasStart = rangeMatch[1] !== "";
    const hasEnd = rangeMatch[2] !== "";
    let start: number;
    let end: number;
    if (!hasStart && !hasEnd) {
      start = NaN;
      end = NaN;
    } else if (!hasStart) {
      start = size - Number(rangeMatch[2]);
      end = size - 1;
    } else {
      start = Number(rangeMatch[1]);
      end = hasEnd ? Number(rangeMatch[2]) : size - 1;
    }
    start = Math.max(0, start);
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
      return new NextResponse("Range Not Satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
    end = Math.min(end, size - 1);
    return new NextResponse(nodeStreamToWeb(getRecordingStream(fullPath, { start, end })), {
      status: 206,
      headers: {
        "Content-Disposition": disposition,
        "Content-Type": "video/mp2t",
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  return new NextResponse(nodeStreamToWeb(getRecordingStream(fullPath)), {
    headers: {
      "Content-Disposition": disposition,
      "Content-Type": "video/mp2t",
      "Accept-Ranges": "bytes",
      "Content-Length": String(size),
    },
  });
}
```

- [ ] **Step 4: 验证**

Run: `pnpm typecheck && pnpm lint`
Expected: 过。手动:`RECORDINGS_DIR` 指向本地测试目录放一个 .ts 文件,`pnpm dev` 后 `curl -sI "http://localhost:3000/api/recording/download?anchor=测试&file=x.ts"`(需登录 cookie,可浏览器验证;此步可留到 Task 8 一起)

- [ ] **Step 5: Commit**

```bash
git add src/lib/http/node-stream.ts src/app/api/recording
git commit -m "feat(recording): 头像转发+录像流式下载(Range)API 路由"
```

---

### Task 8: 录制任务页 `/recording`

**Files:**
- Create: `src/app/(dashboard)/recording/page.tsx`, `src/app/(dashboard)/recording/_components/recording-tasks.tsx`

**⚠️ 视觉门(项目 feedback 铁律):写 UI 前先用 huashu-design 出 3 个列表形态变体(如:卡片网格 / 紧凑表格 / 左状态条列表)给用户选,选定后再实施。**下方代码是功能完整的基线实现(表格形态),变体选定后调整视觉层,交互与数据流不变。

- [ ] **Step 1: huashu-design 出 3 变体并等用户选定**

产出 3 个 HTML 变体(数据用线上真实快照字段:主播名/平台/状态/累计体积/时长/头像),Artifact 发给用户选。
Expected: 用户回复选定方案

- [ ] **Step 2: page.tsx(server component,照 software/page.tsx)**

```tsx
import { redirect } from "next/navigation";
import { getRecorderSnapshot, requireRecordingViewer } from "@/modules/recording/server";
import { RecordingTasks } from "./_components/recording-tasks";

export const dynamic = "force-dynamic";

export default async function RecordingPage() {
  let canEdit = false;
  try {
    const { perm } = await requireRecordingViewer();
    canEdit = perm.can_edit;
  } catch {
    redirect("/dashboard");
  }

  const snapshot = await getRecorderSnapshot();
  return <RecordingTasks initialSnapshot={snapshot} canEdit={canEdit} />;
}
```

- [ ] **Step 3: _components/recording-tasks.tsx(client,基线实现)**

功能点(视觉按 Step 1 选定的变体调整):

```tsx
"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  addStreamer,
  controlStreamer,
  fetchRecorderSnapshot,
  updateRecorderConfig,
  type BuiltinTask,
  type RecorderSnapshot,
} from "@/modules/recording";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const POLL_MS = 10_000;

function formatDiskFree(bytes: number | null): string {
  if (bytes === null) return "-";
  const gb = bytes / 1024 ** 3;
  return gb >= 1024 ? `${(gb / 1024).toFixed(2)} TB` : `${gb.toFixed(1)} GB`;
}

function statusTone(t: BuiltinTask): "recording" | "paused" | "error" | "idle" {
  if (t.status.includes("录制中")) return "recording";
  if (t.is_paused) return "paused";
  if (t.status.includes("异常")) return "error";
  return "idle";
}

export function RecordingTasks({
  initialSnapshot,
  canEdit,
}: {
  initialSnapshot: RecorderSnapshot;
  canEdit: boolean;
}) {
  const [snap, setSnap] = useState(initialSnapshot);
  const [addOpen, setAddOpen] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    fetchRecorderSnapshot().then(setSnap).catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      setError(null);
      try {
        await fn();
        refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "操作失败");
      }
    });

  return (
    <div className="space-y-4">
      {/* 顶部状态条:在线徽章 + NAS 剩余空间 + 添加按钮 */}
      {!snap.online && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          录制器离线,任务管理暂不可用(显示最后一次成功快照)
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          NAS 剩余空间:{formatDiskFree(snap.diskFree)} · 共 {snap.tasks.length} 个任务
        </div>
        {canEdit && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button disabled={!snap.online}>添加主播</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>添加录制主播</DialogTitle>
              </DialogHeader>
              <Input
                value={addUrl}
                onChange={(e) => setAddUrl(e.target.value)}
                placeholder="粘贴直播间链接,可加 ,主播:名字 后缀"
              />
              <DialogFooter>
                <Button
                  disabled={pending || !addUrl.trim()}
                  onClick={() =>
                    run(async () => {
                      await addStreamer({ url: addUrl });
                      setAddUrl("");
                      setAddOpen(false);
                    })
                  }
                >
                  添加
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* 任务列表(形态按选定变体) */}
      <div className="grid gap-3">
        {snap.tasks.map((t) => {
          const tone = statusTone(t);
          return (
            <div
              key={`${t.platform}_${t.room_id}`}
              className="flex items-center gap-4 rounded-lg border bg-card p-4"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- 录制器转发图,尺寸不定 */}
              <img
                src={t.avatar ? `/api/recording/avatar?src=${encodeURIComponent(t.avatar)}` : ""}
                alt=""
                className="size-10 rounded-full bg-muted object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{t.anchor_name || t.room_id}</div>
                <div className="text-xs text-muted-foreground">
                  {t.platform} · 房间 {t.room_id} · 累计 {t.file_size}
                </div>
              </div>
              <span
                className={
                  tone === "recording"
                    ? "inline-flex items-center gap-1.5 text-sm text-red-600"
                    : tone === "error"
                      ? "text-sm text-amber-600"
                      : "text-sm text-muted-foreground"
                }
              >
                {tone === "recording" && (
                  <span className="size-2 animate-pulse rounded-full bg-red-500" />
                )}
                {t.status}
                {tone === "recording" && t.duration !== "-" ? ` ${t.duration}` : ""}
              </span>
              {canEdit && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending || !snap.online}
                    onClick={() =>
                      run(() =>
                        controlStreamer({
                          action: t.is_paused ? "resume" : "pause",
                          platform: t.platform,
                          roomId: t.room_id,
                        }),
                      )
                    }
                  >
                    {t.is_paused ? "恢复" : "暂停"}
                  </Button>
                  <ConfirmDialog
                    title={`删除录制任务「${t.anchor_name || t.room_id}」?`}
                    description="仅从录制名单移除,已录文件不受影响。"
                    onConfirm={() =>
                      run(() =>
                        controlStreamer({
                          action: "delete",
                          platform: t.platform,
                          roomId: t.room_id,
                        }),
                      )
                    }
                  >
                    <Button variant="outline" size="sm" disabled={pending || !snap.online}>
                      删除
                    </Button>
                  </ConfirmDialog>
                </div>
              )}
            </div>
          );
        })}
        {snap.tasks.length === 0 && (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            暂无录制任务
          </div>
        )}
      </div>
    </div>
  );
}
```

注:`ConfirmDialog` 的实际 props 以 `src/components/ui/confirm-dialog.tsx` 为准,实施时先读该文件对齐(children 触发器/onConfirm 签名可能不同)。全局配置(画质/分段/轮询)入口:canEdit 时头部加一个「录制设置」Dialog,三个字段(Select quality: uhd 原画/hd 高清/sd 标清;Input number segment_time 分,0=不分段;Input number check_interval 秒),提交调 `updateRecorderConfig`;实现同 add Dialog 模式,不另贴代码。

- [ ] **Step 4: 本地验证(真实数据)**

`.env.local` 加 `RECORDER_API_URL=http://172.16.39.61:8080`(admin/admin 是默认值可不配),`pnpm dev` 打开 `http://localhost:3000/recording`。
Expected: 列表显示线上真实任务(原始传奇=监控中,芝麻/豆掌柜等=已暂停),头像加载,10s 自动刷新;can_edit 账号(张锦)可见操作按钮。**不要点删除真实任务;暂停/恢复选一个已暂停的任务做往返验证(resume→pause 回到原状)。**

- [ ] **Step 5: typecheck/lint/test**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 全过

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/recording
git commit -m "feat(recording): 录制任务页——状态快照列表/增删暂停/全局配置/离线降级"
```

---

### Task 9: 录像文件页 `/recording/files`

**Files:**
- Create: `src/app/(dashboard)/recording/files/page.tsx`, `src/app/(dashboard)/recording/files/_components/recording-files.tsx`

- [ ] **Step 1: page.tsx(server component,searchParams 选中主播)**

```tsx
import { redirect } from "next/navigation";
import {
  listAnchorFiles,
  listAnchorFolders,
  requireRecordingViewer,
} from "@/modules/recording/server";
import { RecordingFiles } from "./_components/recording-files";

export const dynamic = "force-dynamic";

export default async function RecordingFilesPage({
  searchParams,
}: {
  searchParams: Promise<{ anchor?: string }>;
}) {
  let canEdit = false;
  try {
    const { perm } = await requireRecordingViewer();
    canEdit = perm.can_edit;
  } catch {
    redirect("/dashboard");
  }

  const folders = await listAnchorFolders().catch(() => []);
  const { anchor } = await searchParams;
  const selected = anchor && folders.some((f) => f.name === anchor) ? anchor : folders[0]?.name;
  const files = selected ? await listAnchorFiles(selected).catch(() => []) : [];

  return (
    <RecordingFiles folders={folders} selected={selected ?? null} files={files} canEdit={canEdit} />
  );
}
```

- [ ] **Step 2: _components/recording-files.tsx(client)**

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteRecording, type AnchorFolder, type RecordingFile } from "@/modules/recording";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024).toFixed(0)} KB`;
}

export function RecordingFiles({
  folders,
  selected,
  files,
  canEdit,
}: {
  folders: AnchorFolder[];
  selected: string | null;
  files: RecordingFile[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const totalSize = folders.reduce((s, f) => s + f.totalSize, 0);

  return (
    <div className="flex gap-6">
      <aside className="w-64 shrink-0 space-y-1">
        <div className="px-2 pb-2 text-xs text-muted-foreground">
          共 {folders.length} 个主播 · {formatBytes(totalSize)}
        </div>
        {folders.map((f) => (
          <button
            key={f.name}
            onClick={() => router.push(`/recording/files?anchor=${encodeURIComponent(f.name)}`)}
            className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent ${
              f.name === selected ? "bg-accent font-medium" : ""
            }`}
          >
            <span className="truncate">{f.name}</span>
            <span className="ml-2 shrink-0 text-xs text-muted-foreground">
              {f.fileCount} · {formatBytes(f.totalSize)}
            </span>
          </button>
        ))}
        {folders.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">暂无录像</div>
        )}
      </aside>

      <div className="min-w-0 flex-1 space-y-3">
        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>文件名</TableHead>
              <TableHead className="w-28">大小</TableHead>
              <TableHead className="w-44">修改时间</TableHead>
              <TableHead className="w-40">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.map((f) => (
              <TableRow key={f.name}>
                <TableCell className="max-w-0 truncate font-mono text-xs">
                  {f.name}
                  {f.recording && (
                    <span className="ml-2 inline-flex items-center gap-1 text-red-600">
                      <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
                      录制中
                    </span>
                  )}
                </TableCell>
                <TableCell>{formatBytes(f.size)}</TableCell>
                <TableCell>{new Date(f.mtimeMs).toLocaleString("zh-CN")}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button asChild variant="outline" size="sm" disabled={f.recording}>
                      <a
                        href={`/api/recording/download?anchor=${encodeURIComponent(selected ?? "")}&file=${encodeURIComponent(f.name)}`}
                      >
                        下载
                      </a>
                    </Button>
                    {canEdit && (
                      <ConfirmDialog
                        title={`删除「${f.name}」?`}
                        description={`${formatBytes(f.size)} 将被物理删除,不可恢复。`}
                        onConfirm={() =>
                          startTransition(async () => {
                            setError(null);
                            try {
                              await deleteRecording({ anchor: selected, file: f.name });
                              router.refresh();
                            } catch (e) {
                              setError(e instanceof Error ? e.message : "删除失败");
                            }
                          })
                        }
                      >
                        <Button variant="outline" size="sm" disabled={pending || f.recording}>
                          删除
                        </Button>
                      </ConfirmDialog>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {files.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                  该主播暂无录像文件
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

(同 Task 8:ConfirmDialog props 以实际组件为准;视觉细节沿用 Task 8 选定的变体语言。)

- [ ] **Step 3: 本地验证**

`.env.local` 加 `RECORDINGS_DIR=$HOME/qjhy-recordings-dev`,造两个主播文件夹各放 1-2 个假 .ts 文件(一个 mtime 现刻=录制中,一个旧的),访问 `/recording/files`。
Expected: 文件夹列表按大小排序;新文件带录制中红点、下载/删除禁用;旧文件可下载(curl Range 返回 206)、can_edit 可删且确认后消失;删除后文件夹统计刷新。

- [ ] **Step 4: typecheck/lint/test**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 全过

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/recording/files
git commit -m "feat(recording): 录像文件页——主播文件夹/文件表/流式下载/保护删除"
```

---

### Task 10: 导航入册 + 板块 CLAUDE.md + 项目文档 + 收尾验证

**Files:**
- Modify: `src/lib/nav.ts`, `CLAUDE.md`(项目级)
- Create: `src/modules/recording/CLAUDE.md`

- [ ] **Step 1: nav.ts 加顶层项(software 之后)**

lucide 引入 `Video`,NAV 数组 software 项后插入:

```ts
  {
    key: "recording",
    label: "直播录制",
    icon: Video,
    single: true,
    href: "/recording",
    module: "recording",
  },
```

注:文件页 `/recording/files` 不单列导航,由任务页头部放「录像文件」入口按钮(Task 8 组件里加一个 `<Button asChild variant="outline"><Link href="/recording/files">录像文件</Link></Button>`,同排在「添加主播」旁;文件页同位置放「录制任务」返回入口)。若实施 Task 8/9 时已加则跳过。

- [ ] **Step 2: 写 src/modules/recording/CLAUDE.md**

```markdown
# 直播录制(recording)板块须知

## 架构(先读 spec: docs/superpowers/specs/2026-07-10-recording-integration-design.md)

- 本板块是 NAS 上 go-recorder 容器(go-auto-uploader 2026-03 构建)的**控制面**,引擎零改动。
  QJHY 挂掉不影响录制;录制器挂掉只影响任务页(降级横幅),文件页照常。
- **不升级 go-recorder**:实现面向线上构建的 API 面(缺 /api/v1/streamers 等新接口)。
- 无业务表:任务状态在引擎内存(WS 快照),文件在文件系统,仅权限种子(migration 0056)。

## 口径与坑

- **权限**:module key `recording`,照软件库——全员 scope=all(看状态/下载),can_edit(默认总监/老板)才能增删/暂停任务、改配置、删文件。种子在 0056 + role-defaults.ts 特例,勿只改一处。
- **加密协议**(client.ts):RSA-OAEP(SHA-256) 换 32B AES 密钥 → AES-256-GCM,payload=base64(nonce12∥ct∥tag16)。session/token 24h 进程内缓存,401 自动重握手。登录 admin/admin(引擎硬编码)。
- **状态快照**(snapshot.ts):按需连 /ws/live 收第一帧 builtinTasks(连接即推)即断,5s TTL。不做常驻订阅(有意为之,勿"优化")。
- **config POST 是整体覆盖**:必须先 GET 合并,丢 save_path 会导致引擎落盘路径漂移。
- **删文件双保护**:快照录制中主播集合 + mtime<2min 兜底。删除=物理删(释放空间),无回收站。
- **add 的 url 透传**:引擎自己解析链接/短链/,主播:名字 后缀,QJHY 不预解析。
- **urls.txt 勿直写**:引擎会写回该文件固化主播名,外部并发写有竞态——统一走 API。

## 环境变量

`RECORDER_API_URL`(默认 http://172.16.39.61:8080)/ `RECORDER_ADMIN_USER`/`RECORDER_ADMIN_PASS`(默认 admin/admin)/ `RECORDINGS_DIR`(生产 /mnt/recordings 挂载卷,本地开发指测试目录)。

## 运维

- 写接口回归验证:`node scripts/verify-recorder-write-api.mjs`(假房间号 add→delete 往返)。
- 部署:qjhy-web 需挂载 `/volume1/docker/live-recorder/downloads:/mnt/recordings`(rw)。
```

- [ ] **Step 3: 项目级 CLAUDE.md 更新**

- 「板块级文档」表格加一行:`| 直播录制 | src/modules/recording/CLAUDE.md | go-recorder 控制面 / 加密协议 / config 整体覆盖坑 / 删文件双保护 |`
- 「模块清单」20 个 → 21 个,配置行加 `recording`(归入新分组或"账号/排班/打卡"旁,按现有分组风格放"剪辑工作流"之后:`录制:recording`)。
- 数据库表数说明不变(无新业务表),但把 0056 迁移记入(若 CLAUDE.md 有迁移相关段落则不用,当前没有,跳过)。

- [ ] **Step 4: 全量验证**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 全过。浏览器确认:can_edit 账号侧边栏出现「直播录制」;权限页能看到「直播录制」板块并可单独授权;无权限岗位(如找测试账号)导航不显示。

- [ ] **Step 5: Commit**

```bash
git add src/lib/nav.ts src/modules/recording/CLAUDE.md CLAUDE.md
git commit -m "feat(recording): 顶层导航入册+板块 CLAUDE.md+项目文档更新"
```

---

### Task 11: 部署上线(手动检查点,逐步确认)

**Files:** NAS 上的 `/volume1/docker/qjhy/docker-compose.yml` + `.env`(不进 git)

> 完整链路参考 memory `qjhy-pro-nas-deployment.md`。Mac(ARM64)→NAS(amd64) **必须** `--platform linux/amd64`。

- [ ] **Step 1: NAS 应用 migration 0056**

```bash
ssh -i ~/.ssh/id_rsa_nas 15679982012@172.16.39.61 \
  "docker exec -i qjhy-postgres psql -U qjhy -d qjhy" < src/db/migrations/0056_recording_permission_seed.sql
```
Expected: INSERT 0 N;复查 `SELECT COUNT(*) FROM role_default_permission WHERE module='recording';` ≥ 8

- [ ] **Step 2: 改 NAS compose——qjhy-web 增加挂载与环境变量**

`/volume1/docker/qjhy/docker-compose.yml` 的 web 服务:
- `volumes:` 增加 `- /volume1/docker/live-recorder/downloads:/mnt/recordings`
- `environment:`(或 .env)增加 `RECORDER_API_URL=http://172.16.39.61:8080`、`RECORDINGS_DIR=/mnt/recordings`(RECORDER_ADMIN_USER/PASS 用默认值可不配)

- [ ] **Step 3: build → 传输 → 上线(memory 一条龙)**

```bash
docker build --platform linux/amd64 -f Dockerfile.web -t qjhy-web:latest .
docker save qjhy-web:latest | gzip > /tmp/qjhy-web.tar.gz
scp -O -i ~/.ssh/id_rsa_nas /tmp/qjhy-web.tar.gz 15679982012@172.16.39.61:/volume1/docker/qjhy/
ssh -i ~/.ssh/id_rsa_nas 15679982012@172.16.39.61 \
  "cd /volume1/docker/qjhy && gunzip -c qjhy-web.tar.gz | docker load && docker-compose up -d web && rm qjhy-web.tar.gz"
```
Expected: `docker ps` 里 qjhy-web 重建;go-recorder **不受影响**(`docker ps` 确认其 Up 时间未变)

- [ ] **Step 4: 生产 smoke**

- 手机/PC 打开中台 → 「直播录制」导航可见 → 任务页显示真实任务与状态(和 go-recorder 自带控制台 8080 对照一致)
- 文件页列出全部主播文件夹(与 `ls /volume1/docker/live-recorder/downloads` 对照),抽一个旧文件下载成功
- 用一个已暂停任务做 恢复→暂停 往返;确认 go-recorder 控制台同步变化
- 普通成员账号(scope=all 无 can_edit):看得到、下载得了、无操作按钮
Expected: 全部通过;任何一步失败按 systematic-debugging 排查,勿带病收尾

- [ ] **Step 5: 收尾 commit + tag(如有文档级改动)**

```bash
git add -A && git status  # 确认无未预期改动
git commit -m "docs(recording): 部署上线备注" --allow-empty
```
按项目惯例是否打 tag 由用户定(功能级不打,phase 级才打)。

---

## Self-Review 结果(已核)

- **Spec 覆盖**:实测事实表→plan 头部;权限口径→Task 4;两页面→Task 8/9;avatar 转发→Task 7;删除双保护→Task 5/6;离线降级→Task 3/8;写接口验证条款→Task 2(含 404 停止指令);部署挂载/env→Task 11;板块 CLAUDE.md→Task 10;「不做清单」未出现在任何 task ✓
- **占位符**:全部 task 含完整代码/命令/期望输出;ConfirmDialog props 标注了"以实际组件为准"的对齐指令(非占位,是防漂移)✓
- **类型一致**:`BuiltinTask.room_id/anchor_name/is_paused/file_size` 蛇形命名与线上 WS payload 实测一致;`recorderRequest<T>` 返回 `data`;`RecorderSnapshot.fetchedAt` 在 snapshot/组件间一致;`recordingAnchorNames(snap)` 签名 Task 3 定义、Task 6 使用一致 ✓
