export interface SoftwareCategoryItem {
  id: number;
  name: string;
  sortOrder: number;
  itemCount: number; // 分类下未删软件数
}

export interface SoftwareListItem {
  id: number;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  version: string | null;
  note: string | null;
  fileName: string;
  fileSize: number;
  downloadCount: number;
  uploadedByUserId: string | null;
  uploadedByName: string | null;
  uploadedAt: string; // ISO
}

export interface SoftwareListResult {
  items: SoftwareListItem[];
  total: number;
}
