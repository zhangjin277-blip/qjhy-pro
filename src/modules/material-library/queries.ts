import "server-only";
import { and, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  material_asset,
  material_folder,
  material_favorite,
  type MaterialType,
} from "@/db/schema/material";
import { dingtalk_user } from "@/db/schema/dingtalk";
import type { ListAssetsInput } from "./schema";
import type { AssetListItem, AssetListResult, FolderTreeNode } from "./types";

/** 目录树（任意层级嵌套）+ 每节点（含子孙）素材计数。 */
export async function listFolderTree(): Promise<FolderTreeNode[]> {
  const folders = await db
    .select({
      id: material_folder.id,
      name: material_folder.name,
      parentId: material_folder.parent_id,
      sort: material_folder.sort_order,
    })
    .from(material_folder)
    .where(isNull(material_folder.deleted_at))
    .orderBy(material_folder.sort_order, material_folder.id);

  // 每目录直接素材数
  const counts = await db
    .select({ folderId: material_asset.folder_id, n: sql<number>`count(*)::int` })
    .from(material_asset)
    .where(isNull(material_asset.deleted_at))
    .groupBy(material_asset.folder_id);
  const directCount = new Map<number, number>();
  for (const c of counts) if (c.folderId != null) directCount.set(c.folderId, c.n);

  // 建树
  const nodeMap = new Map<number, FolderTreeNode>();
  for (const f of folders) {
    nodeMap.set(f.id, { id: f.id, name: f.name, count: directCount.get(f.id) ?? 0, children: [] });
  }
  const roots: FolderTreeNode[] = [];
  for (const f of folders) {
    const node = nodeMap.get(f.id);
    if (!node) continue;
    const parent = f.parentId != null ? nodeMap.get(f.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  // 自底向上累加子孙计数
  const rollUp = (node: FolderTreeNode): number => {
    let total = node.count;
    for (const child of node.children) total += rollUp(child);
    node.count = total;
    return total;
  };
  for (const r of roots) rollUp(r);
  return roots;
}

export async function listAssets(input: ListAssetsInput, userId: string): Promise<AssetListResult> {
  const conds = [isNull(material_asset.deleted_at)];
  if (input.folderId != null) conds.push(eq(material_asset.folder_id, input.folderId));
  if (input.type) conds.push(eq(material_asset.type, input.type));
  if (input.keyword) conds.push(ilike(material_asset.name, `%${input.keyword}%`));
  if (input.onlyMine) conds.push(eq(material_asset.uploaded_by_user_id, userId));
  if (input.tags && input.tags.length) {
    conds.push(sql`${material_asset.tags} @> ${JSON.stringify(input.tags)}::jsonb`);
  }
  const where = and(...conds);

  const countRows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(material_asset)
    .where(where);
  const total = countRows[0]?.total ?? 0;

  const rows = await db
    .select({
      id: material_asset.id,
      name: material_asset.name,
      type: material_asset.type,
      folderId: material_asset.folder_id,
      tags: material_asset.tags,
      durationSec: material_asset.duration_sec,
      width: material_asset.width,
      height: material_asset.height,
      format: material_asset.format,
      fileSize: material_asset.file_size,
      downloadCount: material_asset.download_count,
      uploadedByUserId: material_asset.uploaded_by_user_id,
      uploadedByName: dingtalk_user.name,
      createdAt: material_asset.created_at,
      favoritedId: material_favorite.id,
    })
    .from(material_asset)
    .leftJoin(dingtalk_user, eq(dingtalk_user.user_id, material_asset.uploaded_by_user_id))
    .leftJoin(
      material_favorite,
      and(eq(material_favorite.asset_id, material_asset.id), eq(material_favorite.user_id, userId)),
    )
    .where(where)
    .orderBy(desc(material_asset.created_at))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);

  return {
    total,
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type as MaterialType,
      folderId: r.folderId,
      tags: r.tags ?? [],
      durationSec: r.durationSec,
      width: r.width,
      height: r.height,
      format: r.format,
      fileSize: r.fileSize,
      downloadCount: r.downloadCount,
      uploadedByUserId: r.uploadedByUserId,
      uploadedByName: r.uploadedByName,
      uploadedAt: r.createdAt.toISOString(),
      favorited: r.favoritedId != null,
    })),
  };
}

export async function getAsset(id: number): Promise<AssetListItem | null> {
  const [r] = await db
    .select({
      id: material_asset.id,
      name: material_asset.name,
      type: material_asset.type,
      folderId: material_asset.folder_id,
      tags: material_asset.tags,
      durationSec: material_asset.duration_sec,
      width: material_asset.width,
      height: material_asset.height,
      format: material_asset.format,
      fileSize: material_asset.file_size,
      downloadCount: material_asset.download_count,
      uploadedByUserId: material_asset.uploaded_by_user_id,
      uploadedByName: dingtalk_user.name,
      createdAt: material_asset.created_at,
    })
    .from(material_asset)
    .leftJoin(dingtalk_user, eq(dingtalk_user.user_id, material_asset.uploaded_by_user_id))
    .where(and(eq(material_asset.id, id), isNull(material_asset.deleted_at)));
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    type: r.type as MaterialType,
    folderId: r.folderId,
    tags: r.tags ?? [],
    durationSec: r.durationSec,
    width: r.width,
    height: r.height,
    format: r.format,
    fileSize: r.fileSize,
    downloadCount: r.downloadCount,
    uploadedByUserId: r.uploadedByUserId,
    uploadedByName: r.uploadedByName,
    uploadedAt: r.createdAt.toISOString(),
    favorited: false,
  };
}
