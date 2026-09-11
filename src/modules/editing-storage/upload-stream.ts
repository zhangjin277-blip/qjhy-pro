import "server-only";
import busboy from "busboy";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, rename, stat, unlink } from "node:fs/promises";
import { Readable, Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { dirname, join, resolve } from "node:path";

const TMP_DIR = ".tmp";
export const UPLOAD_CHUNK_BYTES = 32 * 1024 * 1024;

export interface ParsedUpload {
  fields: Record<string, string>;
  fileName: string;
  mimeType: string;
  md5: string;
  bytes: number;
  tmpRelPath: string; // 相对 nasRoot，位于 .tmp/ 下
}

function fullInside(nasRoot: string, relPath: string): string {
  const full = resolve(nasRoot, relPath);
  const root = resolve(nasRoot);
  if (full !== root && !full.startsWith(root + "/")) {
    throw new Error(`path outside NAS root: ${relPath}`);
  }
  return full;
}

function chunkRelPath(uploadId: string): string {
  if (!/^[a-f0-9-]{36}$/i.test(uploadId)) throw new Error("invalid upload id");
  return join(TMP_DIR, `chunk-${uploadId}`);
}

export async function appendUploadChunk(
  req: Request,
  nasRoot: string,
  uploadId: string,
  offset: number,
  expectedBytes: number,
): Promise<number> {
  if (!req.body) throw new Error("empty request body");
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("invalid chunk offset");
  if (
    !Number.isSafeInteger(expectedBytes) ||
    expectedBytes < 1 ||
    expectedBytes > UPLOAD_CHUNK_BYTES
  ) {
    throw new Error("invalid chunk size");
  }

  const full = fullInside(nasRoot, chunkRelPath(uploadId));
  await mkdir(dirname(full), { recursive: true });
  const currentBytes = await stat(full)
    .then((s) => s.size)
    .catch((e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT") return 0;
      throw e;
    });
  if (currentBytes !== offset) throw new Error(`chunk offset mismatch: expected ${currentBytes}`);

  let received = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > expectedBytes) callback(new Error("chunk exceeds declared size"));
      else callback(null, chunk);
    },
  });
  await pipeline(
    Readable.fromWeb(req.body as never),
    counter,
    createWriteStream(full, { flags: offset === 0 ? "w" : "a" }),
  );
  if (received !== expectedBytes) throw new Error("incomplete chunk");
  return offset + received;
}

export async function finishChunkedUpload(
  nasRoot: string,
  uploadId: string,
  expectedBytes: number,
): Promise<{ md5: string; bytes: number; tmpRelPath: string }> {
  const tmpRelPath = chunkRelPath(uploadId);
  const full = fullInside(nasRoot, tmpRelPath);
  const info = await stat(full);
  if (info.size !== expectedBytes)
    throw new Error(`incomplete upload: received ${info.size} bytes`);
  const hash = createHash("md5");
  await pipeline(
    createReadStream(full),
    new Writable({
      write(chunk: Buffer, _encoding, callback) {
        hash.update(chunk);
        callback();
      },
    }),
  );
  return { md5: hash.digest("hex"), bytes: info.size, tmpRelPath };
}

export async function removeChunkedUpload(nasRoot: string, uploadId: string): Promise<void> {
  await removeFile(nasRoot, chunkRelPath(uploadId));
}

/**
 * 流式解析 multipart 上传：把文件 part 边读边写入 NAS 临时文件，同时增量计算 md5。
 *
 * 关键：峰值内存恒为 ~64KB（一个 chunk），不随文件大小增长。这取代了原来
 * `Buffer.from(await file.arrayBuffer())` 的全量进内存方案 —— 后者上传 1.6G 文件
 * 时峰值 ~5G（formData 缓冲 + arrayBuffer + Buffer copy），在 7.6G 的 NAS 上触发
 * 内核 OOM killer 杀进程、容器重启、前端报 "Failed to fetch"。
 *
 * 返回临时文件相对路径 + md5。调用方拿到 md5 做去重判断后：
 *   - 命中去重 → removeTemp（删临时文件，复用已有路径）
 *   - 未命中   → moveTemp（rename 到正式路径，同 NAS mount 原子操作）
 */
export async function parseUploadToTemp(req: Request, nasRoot: string): Promise<ParsedUpload> {
  const contentType = req.headers.get("content-type");
  if (!contentType || !contentType.includes("multipart/form-data")) {
    throw new Error("expected multipart/form-data");
  }
  if (!req.body) throw new Error("empty request body");

  const tmpRel = join(TMP_DIR, `up-${randomBytes(12).toString("hex")}`);
  const tmpFull = fullInside(nasRoot, tmpRel);
  await mkdir(dirname(tmpFull), { recursive: true });

  const fields: Record<string, string> = {};
  let fileName = "";
  let mimeType = "";
  let bytes = 0;
  let sawFile = false;
  const hash = createHash("md5");

  // defParamCharset: busboy 默认按 latin1 解码 filename=，浏览器发的是裸 UTF-8 字节，
  // 不显式指定 utf8 中文文件名会变 "æµè¯.mp4" 乱码（formData() 旧方案没这个问题）
  const bb = busboy({ headers: { "content-type": contentType }, defParamCharset: "utf8" });
  const ws = createWriteStream(tmpFull);
  const nodeReq = Readable.fromWeb(req.body as never);

  try {
    await new Promise<void>((resolvePromise, reject) => {
      let bbDone = false;
      let wsDone = false;
      const tryResolve = () => {
        if (bbDone && wsDone) resolvePromise();
      };

      bb.on("field", (name, val) => {
        fields[name] = val;
      });
      bb.on("file", (_name, stream, info) => {
        if (sawFile) {
          // 第二个 file part：两个流写同一 ws 会内容拼接损坏 + md5/bytes 混算，整个上传拒绝
          stream.resume(); // 丢弃数据，避免 busboy 卡住
          reject(new Error("一次上传只支持单个文件"));
          return;
        }
        sawFile = true;
        fileName = info.filename ?? "";
        mimeType = info.mimeType ?? "";
        stream.on("data", (chunk: Buffer) => {
          hash.update(chunk);
          bytes += chunk.length;
        });
        stream.on("error", reject);
        stream.pipe(ws); // pipe 自带背压：ws 写慢时自动暂停上游读取
      });
      bb.on("error", reject);
      bb.on("close", () => {
        bbDone = true;
        // 无 file part：ws 从未被 pipe，手动 end 让它触发 finish
        if (!sawFile) ws.end();
        tryResolve();
      });
      ws.on("error", reject);
      ws.on("finish", () => {
        wsDone = true;
        tryResolve();
      });
      nodeReq.on("error", reject);
      nodeReq.pipe(bb);
    });
  } catch (err) {
    nodeReq.destroy(); // 停止继续消费请求体（reject 后管道可能还在后台 pump）
    ws.destroy();
    await unlink(tmpFull).catch(() => undefined);
    throw err;
  }

  if (!sawFile) {
    await unlink(tmpFull).catch(() => undefined);
    throw new Error("no file part in upload");
  }

  return { fields, fileName, mimeType, md5: hash.digest("hex"), bytes, tmpRelPath: tmpRel };
}

/** 把临时文件移动到正式相对路径（同 NAS mount，rename 原子）。目标目录自动创建。 */
export async function moveTemp(nasRoot: string, fromRel: string, toRel: string): Promise<void> {
  const from = fullInside(nasRoot, fromRel);
  const to = fullInside(nasRoot, toRel);
  await mkdir(dirname(to), { recursive: true });
  await rename(from, to);
}

/**
 * 排他移动：目标已存在时抛 EEXIST，绝不覆盖。
 *
 * rename 对已存在目标是静默覆盖 —— 两个并发上传算出同一序号时，
 * 「fileExists 检查 → rename」之间的 TOCTOU 窗口会让后到者吃掉先到者的文件。
 * 这里先 open(to, "wx")（O_CREAT|O_EXCL）占位：CIFS/NFS 由服务端原子裁决，
 * 并发时只有一个能创建成功，从根上关死竞态。占位成功后 rename 覆盖的是
 * 自己的占位空文件（同 mount 原子）；rename 失败则回收占位。
 */
export async function moveTempExclusive(
  nasRoot: string,
  fromRel: string,
  toRel: string,
): Promise<void> {
  const from = fullInside(nasRoot, fromRel);
  const to = fullInside(nasRoot, toRel);
  await mkdir(dirname(to), { recursive: true });
  const fh = await open(to, "wx"); // 目标已存在 → 抛 EEXIST，调用方换序号重试
  await fh.close();
  try {
    await rename(from, to);
  } catch (err) {
    await unlink(to).catch(() => undefined); // rename 失败回收占位文件
    throw err;
  }
}

/**
 * 按序号重试的排他落盘：buildPath(seq) 生成目标路径，EEXIST 时 seq++ 直到成功。
 * 返回实际使用的相对路径。上限 500 次防御性兜底（正常一天不可能有 500 个同组文件）。
 */
export async function moveTempWithSeq(
  nasRoot: string,
  tmpRelPath: string,
  buildPath: (seq: number) => string,
  startSeq: number,
): Promise<string> {
  let seq = startSeq;
  for (let attempt = 0; attempt < 500; attempt++) {
    const relPath = buildPath(seq);
    try {
      await moveTempExclusive(nasRoot, tmpRelPath, relPath);
      return relPath;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") {
        seq++;
        continue;
      }
      throw err;
    }
  }
  throw new Error("sequence allocation exhausted (500 attempts)");
}

/** 删除 NAS 相对路径文件（幂等，不存在不报错）。临时文件清理 / DB 写失败后的补偿删除共用。 */
export async function removeFile(nasRoot: string, relPath: string): Promise<void> {
  const full = fullInside(nasRoot, relPath);
  await unlink(full).catch(() => undefined);
}

/** 删除临时文件（去重命中时不需要保留）。 */
export const removeTemp = removeFile;
