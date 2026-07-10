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
