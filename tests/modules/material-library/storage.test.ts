import { describe, it, expect, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { material_asset } from "@/db/schema/material";
import { dingtalk_user } from "@/db/schema/dingtalk";
import { ingestMaterial, listAssets } from "@/modules/material-library/server";
import { removeFile } from "@/modules/editing-storage/server";

const NAS = process.env.EDITING_NAS_PATH ?? "./tmp/editing-nas";
const createdIds: number[] = [];
const createdPaths: string[] = [];

afterEach(async () => {
  for (const id of createdIds) {
    await db
      .delete(material_asset)
      .where(eq(material_asset.id, id))
      .catch(() => undefined);
  }
  for (const p of createdPaths) {
    await removeFile(NAS, p).catch(() => undefined);
  }
  createdIds.length = 0;
  createdPaths.length = 0;
});

async function realUserId(): Promise<string | null> {
  const [u] = await db.select({ id: dingtalk_user.user_id }).from(dingtalk_user).limit(1);
  return u?.id ?? null;
}

async function makeTempFile(): Promise<{ md5: string; tmpRel: string; bytes: number }> {
  const content = Buffer.from(`TEST-MATERIAL-${Date.now()}-${Math.round(Math.random() * 1e9)}`);
  const md5 = createHash("md5").update(content).digest("hex");
  const tmpRel = join(".tmp", `vitest-${md5.slice(0, 10)}`);
  await mkdir(join(NAS, ".tmp"), { recursive: true });
  await writeFile(join(NAS, tmpRel), content);
  return { md5, tmpRel, bytes: content.length };
}

describe("material-library 上传/入库/查询/去重/删除", () => {
  it("ingest 视频：落 NAS + 入库 + 类型识别 + 标签 + 可查", async () => {
    const userId = await realUserId();
    if (!userId) return; // 无用户数据时跳过
    const { md5, tmpRel, bytes } = await makeTempFile();

    const r = await ingestMaterial(NAS, {
      fileName: "测试爆奖素材.mp4",
      mimeType: "video/mp4",
      md5,
      bytes,
      tmpRelPath: tmpRel,
      folderId: null,
      tags: ["测试", "爆奖"],
      name: null,
      durationSec: 12,
      width: 1080,
      height: 1920,
      uploadedByUserId: userId,
    });
    createdIds.push(r.assetId);

    expect(r.ok).toBe(true);
    expect(r.deduped).toBe(false);
    expect(r.assetId).toBeGreaterThan(0);

    const [row] = await db.select().from(material_asset).where(eq(material_asset.id, r.assetId));
    if (!row) throw new Error("DB 行未创建");
    createdPaths.push(row.nas_path);
    expect(row.type).toBe("video");
    expect(row.tags).toEqual(["测试", "爆奖"]);
    expect(row.name).toBe("测试爆奖素材.mp4");
    expect(row.nas_path).toContain("素材库/video/");

    // NAS 物理文件存在
    const st = await stat(join(NAS, row.nas_path));
    expect(st.size).toBe(bytes);

    // listAssets 能查到
    const list = await listAssets({ page: 1, pageSize: 100 }, userId);
    expect(list.items.some((i) => i.id === r.assetId)).toBe(true);
  });

  it("MD5 去重：同内容再传命中已有素材，不新建", async () => {
    const userId = await realUserId();
    if (!userId) return;
    const { md5, tmpRel, bytes } = await makeTempFile();

    const r1 = await ingestMaterial(NAS, {
      fileName: "dup.mp4",
      mimeType: "video/mp4",
      md5,
      bytes,
      tmpRelPath: tmpRel,
      folderId: null,
      tags: [],
      name: null,
      durationSec: null,
      width: null,
      height: null,
      uploadedByUserId: userId,
    });
    createdIds.push(r1.assetId);
    const [row1] = await db.select().from(material_asset).where(eq(material_asset.id, r1.assetId));
    if (!row1) throw new Error("DB 行未创建");
    createdPaths.push(row1.nas_path);

    // 再造同内容临时文件（上一个已被 move 走）
    await writeFile(join(NAS, tmpRel), Buffer.from(`X`)); // 占位，内容无关，md5 由参数决定
    const r2 = await ingestMaterial(NAS, {
      fileName: "dup.mp4",
      mimeType: "video/mp4",
      md5,
      bytes,
      tmpRelPath: tmpRel,
      folderId: null,
      tags: [],
      name: null,
      durationSec: null,
      width: null,
      height: null,
      uploadedByUserId: userId,
    });

    expect(r2.deduped).toBe(true);
    expect(r2.assetId).toBe(r1.assetId);
  });

  it("软删后 listAssets 不再返回", async () => {
    const userId = await realUserId();
    if (!userId) return;
    const { md5, tmpRel, bytes } = await makeTempFile();

    const r = await ingestMaterial(NAS, {
      fileName: "del.png",
      mimeType: "image/png",
      md5,
      bytes,
      tmpRelPath: tmpRel,
      folderId: null,
      tags: [],
      name: null,
      durationSec: null,
      width: 800,
      height: 600,
      uploadedByUserId: userId,
    });
    createdIds.push(r.assetId);
    const [row] = await db.select().from(material_asset).where(eq(material_asset.id, r.assetId));
    if (!row) throw new Error("DB 行未创建");
    createdPaths.push(row.nas_path);
    expect(row.type).toBe("image");

    await db
      .update(material_asset)
      .set({ deleted_at: sql`now()` })
      .where(eq(material_asset.id, r.assetId));

    const list = await listAssets({ page: 1, pageSize: 100 }, userId);
    expect(list.items.some((i) => i.id === r.assetId)).toBe(false);
  });
});
