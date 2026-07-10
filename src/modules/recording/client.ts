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
      encrypted: sealPayload(
        Buffer.from(JSON.stringify({ username: user, password: pass })),
        aesKey,
      ),
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
      ? {
          body: JSON.stringify({
            encrypted: sealPayload(Buffer.from(JSON.stringify(body)), session.aesKey),
          }),
        }
      : {}),
  });
  const plain = raw.encrypted
    ? (JSON.parse(
        openPayload(raw.encrypted as string, session.aesKey).toString("utf8"),
      ) as RecorderResponse<T>)
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
