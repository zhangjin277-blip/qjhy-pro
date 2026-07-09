import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { software_category, software_item } from "@/db/schema/software";
import {
  categoryHasActiveItems,
  categoryNameTaken,
  listCategories,
} from "@/modules/software-library/server";

const createdCatIds: number[] = [];
const createdItemIds: number[] = [];

afterEach(async () => {
  for (const id of createdItemIds) {
    await db
      .delete(software_item)
      .where(eq(software_item.id, id))
      .catch(() => undefined);
  }
  for (const id of createdCatIds) {
    await db
      .delete(software_category)
      .where(eq(software_category.id, id))
      .catch(() => undefined);
  }
  createdItemIds.length = 0;
  createdCatIds.length = 0;
});

async function makeCategory(name: string): Promise<number> {
  const [row] = await db
    .insert(software_category)
    .values({ name })
    .returning({ id: software_category.id });
  if (!row) throw new Error("插入分类失败");
  createdCatIds.push(row.id);
  return row.id;
}

describe("分类重名校验 categoryNameTaken", () => {
  it("同名已存在返回 true；excludeId 排除自身", async () => {
    const name = `vitest-分类-${Date.now()}`;
    const id = await makeCategory(name);
    expect(await categoryNameTaken(name)).toBe(true);
    expect(await categoryNameTaken(name, id)).toBe(false);
    expect(await categoryNameTaken(`${name}-不存在`)).toBe(false);
  });
});

describe("分类删除保护 categoryHasActiveItems", () => {
  it("有未删软件 true；软删后 false", async () => {
    const id = await makeCategory(`vitest-删保-${Date.now()}`);
    const [item] = await db
      .insert(software_item)
      .values({
        category_id: id,
        name: "t",
        nas_path: `软件库/test/vitest-${Date.now()}`,
        file_name: "t.exe",
        file_hash: `vitest-${Date.now()}`,
        file_size: 1,
      })
      .returning({ id: software_item.id });
    if (!item) throw new Error("插入软件失败");
    createdItemIds.push(item.id);

    expect(await categoryHasActiveItems(id)).toBe(true);

    await db
      .update(software_item)
      .set({ deleted_at: new Date() })
      .where(eq(software_item.id, item.id));
    expect(await categoryHasActiveItems(id)).toBe(false);
  });
});

describe("listCategories 计数", () => {
  it("itemCount 只数未删软件", async () => {
    const id = await makeCategory(`vitest-计数-${Date.now()}`);
    const mk = async (deleted: boolean) => {
      const [item] = await db
        .insert(software_item)
        .values({
          category_id: id,
          name: "t",
          nas_path: `软件库/test/vitest-${Date.now()}-${Math.random()}`,
          file_name: "t.exe",
          file_hash: `vitest-${Date.now()}-${Math.random()}`,
          file_size: 1,
          ...(deleted ? { deleted_at: new Date() } : {}),
        })
        .returning({ id: software_item.id });
      if (!item) throw new Error("插入软件失败");
      createdItemIds.push(item.id);
    };
    await mk(false);
    await mk(true);

    const cats = await listCategories();
    const cat = cats.find((c) => c.id === id);
    expect(cat?.itemCount).toBe(1);
  });
});
