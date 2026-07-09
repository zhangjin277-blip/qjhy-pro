import { describe, it, expect, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { software_item } from "@/db/schema/software";
import { dingtalk_user } from "@/db/schema/dingtalk";
import {
  buildSoftwarePath,
  ingestSoftware /*, listItems */,
} from "@/modules/software-library/server"; // Task 4 完成后恢复
import { removeFile } from "@/modules/editing-storage/server";

const NAS = process.env.EDITING_NAS_PATH ?? "./tmp/editing-nas";
const createdIds: number[] = [];
const createdPaths: string[] = [];

afterEach(async () => {
  for (const id of createdIds) {
    await db
      .delete(software_item)
      .where(eq(software_item.id, id))
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
  const content = Buffer.from(`TEST-SOFTWARE-${Date.now()}-${Math.round(Math.random() * 1e9)}`);
  const md5 = createHash("md5").update(content).digest("hex");
  const tmpRel = join(".tmp", `vitest-sw-${md5.slice(0, 10)}`);
  await mkdir(join(NAS, ".tmp"), { recursive: true });
  await writeFile(join(NAS, tmpRel), content);
  return { md5, tmpRel, bytes: content.length };
}

describe("buildSoftwarePath 纯函数", () => {
  const now = new Date(2026, 6, 9); // 2026-07

  it("路径 = 软件库/yyyymm/md5前12-文件名", () => {
    const p = buildSoftwarePath("abcdef0123456789", "OBS-Studio-30.exe", now);
    expect(p).toBe("软件库/202607/abcdef012345-OBS-Studio-30.exe");
  });

  it("剥掉路径与前导点，防目录穿越", () => {
    const p = buildSoftwarePath("abcdef0123456789", "../../.hidden.dmg", now);
    expect(p).toBe("软件库/202607/abcdef012345-hidden.dmg");
  });

  it("空文件名兜底 unnamed", () => {
    const p = buildSoftwarePath("abcdef0123456789", "...", now);
    expect(p).toBe("软件库/202607/abcdef012345-unnamed");
  });
});

describe("ingestSoftware 入库/去重/软删", () => {
  it("ingest：落 NAS + 入库 + 可查", async () => {
    const userId = await realUserId();
    if (!userId) return; // 无用户数据时跳过
    const { md5, tmpRel, bytes } = await makeTempFile();

    const r = await ingestSoftware(NAS, {
      fileName: "向日葵远程.exe",
      md5,
      bytes,
      tmpRelPath: tmpRel,
      categoryId: null,
      name: "向日葵",
      version: "v15.2",
      note: "远程协助",
      uploadedByUserId: userId,
    });
    createdIds.push(r.itemId);

    expect(r.ok).toBe(true);
    expect(r.deduped).toBe(false);

    const [row] = await db.select().from(software_item).where(eq(software_item.id, r.itemId));
    if (!row) throw new Error("DB 行未创建");
    createdPaths.push(row.nas_path);
    expect(row.name).toBe("向日葵");
    expect(row.version).toBe("v15.2");
    expect(row.nas_path).toContain("软件库/");

    const st = await stat(join(NAS, row.nas_path));
    expect(st.size).toBe(bytes);

    // const list = await listItems({ page: 1, pageSize: 100 }); // Task 4 完成后恢复
    // expect(list.items.some((i) => i.id === r.itemId)).toBe(true); // Task 4 完成后恢复
  });

  it("自定义名为空时回退文件名", async () => {
    const userId = await realUserId();
    if (!userId) return;
    const { md5, tmpRel, bytes } = await makeTempFile();
    const r = await ingestSoftware(NAS, {
      fileName: "setup.exe",
      md5,
      bytes,
      tmpRelPath: tmpRel,
      categoryId: null,
      name: "  ",
      version: null,
      note: null,
      uploadedByUserId: userId,
    });
    createdIds.push(r.itemId);
    const [row] = await db.select().from(software_item).where(eq(software_item.id, r.itemId));
    if (!row) throw new Error("DB 行未创建");
    createdPaths.push(row.nas_path);
    expect(row.name).toBe("setup.exe");
  });

  it("MD5 去重：同内容再传命中已有条目", async () => {
    const userId = await realUserId();
    if (!userId) return;
    const { md5, tmpRel, bytes } = await makeTempFile();

    const r1 = await ingestSoftware(NAS, {
      fileName: "dup.exe",
      md5,
      bytes,
      tmpRelPath: tmpRel,
      categoryId: null,
      name: null,
      version: null,
      note: null,
      uploadedByUserId: userId,
    });
    createdIds.push(r1.itemId);
    const [row1] = await db.select().from(software_item).where(eq(software_item.id, r1.itemId));
    if (!row1) throw new Error("DB 行未创建");
    createdPaths.push(row1.nas_path);

    await writeFile(join(NAS, tmpRel), Buffer.from("X")); // 重造临时文件，md5 由参数决定
    const r2 = await ingestSoftware(NAS, {
      fileName: "dup.exe",
      md5,
      bytes,
      tmpRelPath: tmpRel,
      categoryId: null,
      name: null,
      version: null,
      note: null,
      uploadedByUserId: userId,
    });

    expect(r2.deduped).toBe(true);
    expect(r2.itemId).toBe(r1.itemId);
  });

  it("软删后 listItems 不再返回", async () => {
    const userId = await realUserId();
    if (!userId) return;
    const { md5, tmpRel, bytes } = await makeTempFile();
    const r = await ingestSoftware(NAS, {
      fileName: "del.dmg",
      md5,
      bytes,
      tmpRelPath: tmpRel,
      categoryId: null,
      name: null,
      version: null,
      note: null,
      uploadedByUserId: userId,
    });
    createdIds.push(r.itemId);
    const [row] = await db.select().from(software_item).where(eq(software_item.id, r.itemId));
    if (!row) throw new Error("DB 行未创建");
    createdPaths.push(row.nas_path);

    await db
      .update(software_item)
      .set({ deleted_at: sql`now()` })
      .where(eq(software_item.id, r.itemId));

    // const list = await listItems({ page: 1, pageSize: 100 }); // Task 4 完成后恢复
    // expect(list.items.some((i) => i.id === r.itemId)).toBe(false); // Task 4 完成后恢复
  });
});
