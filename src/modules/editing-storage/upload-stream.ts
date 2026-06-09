import "server-only";
import busboy from "busboy";
import { createHash, randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import { dirname, join, resolve } from "node:path";

const TMP_DIR = ".tmp";

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

  const bb = busboy({ headers: { "content-type": contentType } });
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

/** 删除临时文件（去重命中时不需要保留；幂等，文件不存在不报错）。 */
export async function removeTemp(nasRoot: string, relPath: string): Promise<void> {
  const full = fullInside(nasRoot, relPath);
  await unlink(full).catch(() => undefined);
}
