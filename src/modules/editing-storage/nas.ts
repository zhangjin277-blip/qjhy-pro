import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, writeFile as fsWriteFile } from "node:fs/promises";
import { dirname, join, resolve, basename } from "node:path";

export interface PathInput {
  taskId: number;
  product: string;
  materialDate: string; // "YYYY-MM-DD"
  originalName: string;
}

function safeFilename(name: string): string {
  // strip path separators and parent dir markers
  return basename(name).replace(/^\.+/, "") || "unnamed";
}

export function buildSourcePath(input: PathInput): string {
  return join(
    "source",
    `${input.product}-新`,
    `task-${input.taskId}-${safeFilename(input.originalName)}`,
  );
}

export function buildEditedPath(input: PathInput): string {
  return join(
    "edited",
    `${input.product}-新`,
    `task-${input.taskId}-${safeFilename(input.originalName)}`,
  );
}

export function buildCoverPath(input: PathInput): string {
  return join(
    "cover",
    `${input.product}-新`,
    `task-${input.taskId}-${safeFilename(input.originalName)}`,
  );
}

export interface FishPathInput extends PathInput {
  roomName: string | null; // 缺则降级（省略此段）
  anchorName: string; // 必填
  sequenceNumber: number;
}

function buildFishPath(root: "source" | "edited" | "cover", input: FishPathInput): string {
  const dateNoSep = input.materialDate.replace(/-/g, "");
  const nn = String(input.sequenceNumber).padStart(2, "0");
  const ext = safeFilename(input.originalName).match(/\.[^.]+$/)?.[0] ?? "";
  // 完整：YYYYMMDD-{直播间}-{主播}-NN.ext
  // 降级（无直播间）：YYYYMMDD-{主播}-NN.ext
  const segments = input.roomName
    ? [dateNoSep, input.roomName, input.anchorName, nn]
    : [dateNoSep, input.anchorName, nn];
  return join(root, `${input.product}-新`, `${segments.join("-")}${ext}`);
}

export function buildFishSourcePath(input: FishPathInput): string {
  return buildFishPath("source", input);
}

export function buildFishEditedPath(input: FishPathInput): string {
  return buildFishPath("edited", input);
}

export function buildFishCoverPath(input: FishPathInput): string {
  return buildFishPath("cover", input);
}

export function isFishProduct(product: string | null | undefined): boolean {
  return !!product && product.includes("捕鱼");
}

// ─── 斗地主 / 三国冰河时代 命名规则 ─────────────────────────────────────
// 完整：YYYYMMDD-{产品}-{直播间}-NN.ext
// 降级（无直播间）：YYYYMMDD-{产品}-NN.ext
// 不带主播段（与捕鱼系区分）

export interface PokerSlgPathInput extends PathInput {
  roomName: string | null;
  sequenceNumber: number;
}

function buildPokerSlgPath(root: "source" | "edited" | "cover", input: PokerSlgPathInput): string {
  const dateNoSep = input.materialDate.replace(/-/g, "");
  const nn = String(input.sequenceNumber).padStart(2, "0");
  const ext = safeFilename(input.originalName).match(/\.[^.]+$/)?.[0] ?? "";
  const segments = input.roomName
    ? [dateNoSep, input.product, input.roomName, nn]
    : [dateNoSep, input.product, nn];
  return join(root, `${input.product}-新`, `${segments.join("-")}${ext}`);
}

export function buildPokerSlgSourcePath(input: PokerSlgPathInput): string {
  return buildPokerSlgPath("source", input);
}

export function buildPokerSlgEditedPath(input: PokerSlgPathInput): string {
  return buildPokerSlgPath("edited", input);
}

export function buildPokerSlgCoverPath(input: PokerSlgPathInput): string {
  return buildPokerSlgPath("cover", input);
}

export function isPokerSlgProduct(product: string | null | undefined): boolean {
  if (!product) return false;
  return product.includes("斗地主") || product.includes("三国");
}

function assertInsideNas(nasRoot: string, relPath: string): string {
  const full = resolve(nasRoot, relPath);
  const root = resolve(nasRoot);
  if (!full.startsWith(root + "/") && full !== root) {
    throw new Error(`path outside NAS root: ${relPath}`);
  }
  return full;
}

export async function writeFile(nasRoot: string, relPath: string, data: Buffer): Promise<void> {
  const full = assertInsideNas(nasRoot, relPath);
  await mkdir(dirname(full), { recursive: true });
  await fsWriteFile(full, data);
}

export function getDownloadStream(nasRoot: string, relPath: string): NodeJS.ReadableStream {
  const full = assertInsideNas(nasRoot, relPath);
  return createReadStream(full);
}
