import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/page-auth";
import { AppError } from "@/lib/errors";

const MAX_PHOTOS = 3;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const FILE_PATTERN = /^[0-9a-f-]{36}\.(?:jpe?g|png|webp)$/;
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

interface RouteContext {
  params: Promise<{ projectKey: string; anchorName: string }>;
}

async function authorize(): Promise<NextResponse | null> {
  try {
    await requireUser();
    return null;
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.httpStatus });
    }
    throw error;
  }
}

function assetRoot(): string {
  return (
    process.env.PROJECT_ASSETS_PATH ??
    (process.env.NODE_ENV === "production"
      ? "/mnt/qjhy-edit/project-assets"
      : path.join(process.cwd(), ".data/project-assets"))
  );
}

function resolveDirectory(projectKey: string, anchorName: string): string | null {
  if (
    !/^[a-z0-9][a-z0-9-]{0,63}$/.test(projectKey) ||
    anchorName.length < 1 ||
    anchorName.length > 80
  ) {
    return null;
  }
  const anchorKey = createHash("sha256").update(anchorName).digest("hex");
  return path.join(assetRoot(), projectKey, "anchors", anchorKey);
}

async function listFiles(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory)).filter((name) => FILE_PATTERN.test(name)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const denied = await authorize();
  if (denied) return denied;
  const { projectKey, anchorName } = await context.params;
  const directory = resolveDirectory(projectKey, anchorName);
  if (!directory) return NextResponse.json({ error: "无效的主播标识" }, { status: 400 });
  const requestedFile = request.nextUrl.searchParams.get("file");
  if (requestedFile) {
    if (!FILE_PATTERN.test(requestedFile)) {
      return NextResponse.json({ error: "无效的文件名" }, { status: 400 });
    }
    try {
      const data = await readFile(path.join(directory, requestedFile));
      const extension = path.extname(requestedFile).slice(1);
      const contentType =
        extension === "jpg" || extension === "jpeg" ? "image/jpeg" : `image/${extension}`;
      return new NextResponse(data, {
        headers: { "content-type": contentType, "cache-control": "private, max-age=300" },
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return NextResponse.json({ error: "照片不存在" }, { status: 404 });
      }
      throw error;
    }
  }
  const files = await listFiles(directory);
  return NextResponse.json({ files });
}

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const denied = await authorize();
  if (denied) return denied;
  const { projectKey, anchorName } = await context.params;
  const directory = resolveDirectory(projectKey, anchorName);
  if (!directory) return NextResponse.json({ error: "无效的主播标识" }, { status: 400 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "请选择照片" }, { status: 400 });
  const extension = MIME_EXTENSIONS[file.type];
  if (!extension) return NextResponse.json({ error: "仅支持 JPG、PNG 或 WebP" }, { status: 400 });
  if (file.size > MAX_FILE_BYTES)
    return NextResponse.json({ error: "单张照片不能超过 8MB" }, { status: 413 });
  await mkdir(directory, { recursive: true });
  if ((await listFiles(directory)).length >= MAX_PHOTOS) {
    return NextResponse.json({ error: "每名主播最多保存 3 张照片" }, { status: 409 });
  }
  const name = `${randomUUID()}.${extension}`;
  await writeFile(path.join(directory, name), Buffer.from(await file.arrayBuffer()), {
    flag: "wx",
  });
  return NextResponse.json({ file: name }, { status: 201 });
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const denied = await authorize();
  if (denied) return denied;
  const { projectKey, anchorName } = await context.params;
  const directory = resolveDirectory(projectKey, anchorName);
  const file = request.nextUrl.searchParams.get("file") ?? "";
  if (!directory || !FILE_PATTERN.test(file)) {
    return NextResponse.json({ error: "无效的照片标识" }, { status: 400 });
  }
  await rm(path.join(directory, file), { force: true });
  return NextResponse.json({ ok: true });
}
