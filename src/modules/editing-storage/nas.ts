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
    input.product,
    input.materialDate,
    `task-${input.taskId}-${safeFilename(input.originalName)}`,
  );
}

export function buildEditedPath(input: PathInput): string {
  return join(
    "edited",
    input.product,
    input.materialDate,
    `task-${input.taskId}-${safeFilename(input.originalName)}`,
  );
}

export function buildCoverPath(input: PathInput): string {
  return join(
    "cover",
    input.product,
    input.materialDate,
    `task-${input.taskId}-${safeFilename(input.originalName)}`,
  );
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
