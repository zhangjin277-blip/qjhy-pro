import type { MaterialType } from "@/db/schema/material";

export type { MaterialType };

export interface FolderTreeNode {
  id: number;
  name: string;
  count: number; // 本目录 + 所有子孙目录素材数
  children: FolderTreeNode[];
}

export interface AssetListItem {
  id: number;
  name: string;
  type: MaterialType;
  folderId: number | null;
  tags: string[];
  durationSec: number | null;
  width: number | null;
  height: number | null;
  format: string | null;
  fileSize: number;
  downloadCount: number;
  uploadedByUserId: string | null;
  uploadedByName: string | null;
  uploadedAt: string; // ISO
  favorited: boolean; // 当前用户是否已收藏
}

export interface AssetListResult {
  items: AssetListItem[];
  total: number;
}
