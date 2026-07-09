import "server-only";
import { and, desc, eq, ilike, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { software_category, software_item } from "@/db/schema/software";
import { dingtalk_user } from "@/db/schema/dingtalk";
import type { ListItemsInput } from "./schema";
import type { SoftwareCategoryItem, SoftwareListItem, SoftwareListResult } from "./types";

/** 全部分类 + 每分类未删软件数。 */
export async function listCategories(): Promise<SoftwareCategoryItem[]> {
  const rows = await db
    .select({
      id: software_category.id,
      name: software_category.name,
      sortOrder: software_category.sort_order,
      itemCount: sql<number>`count(${software_item.id})::int`,
    })
    .from(software_category)
    .leftJoin(
      software_item,
      and(eq(software_item.category_id, software_category.id), isNull(software_item.deleted_at)),
    )
    .groupBy(software_category.id)
    .orderBy(software_category.sort_order, software_category.id);
  return rows;
}

export async function listItems(input: ListItemsInput): Promise<SoftwareListResult> {
  const conds = [isNull(software_item.deleted_at)];
  if (input.category === "none") conds.push(isNull(software_item.category_id));
  else if (typeof input.category === "number")
    conds.push(eq(software_item.category_id, input.category));
  if (input.keyword) {
    const kw = `%${input.keyword}%`;
    const kwCond = or(ilike(software_item.name, kw), ilike(software_item.file_name, kw));
    if (kwCond) conds.push(kwCond);
  }
  const where = and(...conds);

  const countRows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(software_item)
    .where(where);
  const total = countRows[0]?.total ?? 0;

  const rows = await db
    .select({
      id: software_item.id,
      name: software_item.name,
      categoryId: software_item.category_id,
      categoryName: software_category.name,
      version: software_item.version,
      note: software_item.note,
      fileName: software_item.file_name,
      fileSize: software_item.file_size,
      downloadCount: software_item.download_count,
      uploadedByUserId: software_item.uploaded_by_user_id,
      uploadedByName: dingtalk_user.name,
      createdAt: software_item.created_at,
    })
    .from(software_item)
    .leftJoin(software_category, eq(software_category.id, software_item.category_id))
    .leftJoin(dingtalk_user, eq(dingtalk_user.user_id, software_item.uploaded_by_user_id))
    .where(where)
    .orderBy(desc(software_item.created_at), desc(software_item.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);

  return {
    total,
    items: rows.map(
      (r): SoftwareListItem => ({
        id: r.id,
        name: r.name,
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        version: r.version,
        note: r.note,
        fileName: r.fileName,
        fileSize: r.fileSize,
        downloadCount: r.downloadCount,
        uploadedByUserId: r.uploadedByUserId,
        uploadedByName: r.uploadedByName,
        uploadedAt: r.createdAt.toISOString(),
      }),
    ),
  };
}

/** 下载路由用：取未删条目的物理路径与原始文件名。 */
export async function getItemFile(
  id: number,
): Promise<{ nasPath: string; fileName: string } | null> {
  const [r] = await db
    .select({ nasPath: software_item.nas_path, fileName: software_item.file_name })
    .from(software_item)
    .where(and(eq(software_item.id, id), isNull(software_item.deleted_at)));
  return r ?? null;
}

/** 分类名是否已被占用（excludeId 用于重命名时排除自身）。 */
export async function categoryNameTaken(name: string, excludeId?: number): Promise<boolean> {
  const conds = [eq(software_category.name, name)];
  if (excludeId != null) conds.push(ne(software_category.id, excludeId));
  const [row] = await db
    .select({ id: software_category.id })
    .from(software_category)
    .where(and(...conds))
    .limit(1);
  return row != null;
}

/** 分类下是否还有未删软件（删除保护）。 */
export async function categoryHasActiveItems(id: number): Promise<boolean> {
  const [row] = await db
    .select({ id: software_item.id })
    .from(software_item)
    .where(and(eq(software_item.category_id, id), isNull(software_item.deleted_at)))
    .limit(1);
  return row != null;
}
