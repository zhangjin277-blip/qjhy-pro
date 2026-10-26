import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { requireProcurementAccess } from "@/modules/procurement";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    await requireProcurementAccess("create");
    const file = (await req.formData()).get("file");
    if (!(file instanceof File) || file.size > 5 * 1024 * 1024)
      return Response.json({ error: { message: "请选择不超过 5MB 的图片" } }, { status: 400 });
    const ext: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "image/gif": "gif",
    };
    if (!ext[file.type])
      return Response.json({ error: { message: "仅支持 PNG、JPG、WebP、GIF" } }, { status: 400 });
    const root = process.env.PROCUREMENT_MEDIA_PATH || join(process.cwd(), ".data/procurement");
    await mkdir(root, { recursive: true });
    const name = `${randomUUID()}.${ext[file.type]}`;
    await writeFile(join(root, name), Buffer.from(await file.arrayBuffer()));
    return Response.json({ url: `/uploads/procurement/${name}` });
  } catch (e) {
    return Response.json(
      { error: { message: e instanceof Error ? e.message : "上传失败" } },
      { status: 403 },
    );
  }
}
