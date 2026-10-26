import { readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { requireProcurementAccess } from "@/modules/procurement";
export async function GET(req: Request) {
  try {
    await requireProcurementAccess();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  const raw = new URL(req.url).searchParams.get("path") || "";
  const name = basename(raw);
  if (raw !== `/uploads/procurement/${name}` || !/\.(png|jpg|jpeg|gif|webp)$/i.test(name))
    return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(
      join(process.env.PROCUREMENT_MEDIA_PATH || join(process.cwd(), ".data/procurement"), name),
    );
    const ext = name.split(".").pop()?.toLowerCase();
    return new Response(bytes, {
      headers: {
        "Content-Type": ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
