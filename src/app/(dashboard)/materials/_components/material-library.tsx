"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Upload,
  Star,
  Play,
  Image as ImageIcon,
  Music,
  Film,
  Folder,
  FolderOpen,
  Plus,
  Pencil,
  ChevronRight,
  Download,
  Eye,
  Trash2,
  Clock,
  LayoutGrid,
  Heart,
  FileUp,
  File as FileIcon,
  FolderUp,
  FolderInput,
  Check,
  X,
  Loader2,
} from "lucide-react";

import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TagInput } from "@/components/ui/tag-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import {
  updateAsset,
  deleteAsset,
  createFolder,
  renameFolder,
  deleteFolder,
  toggleFavorite,
  batchMoveAssets,
  batchDeleteAssets,
} from "@/modules/material-library";
import type { AssetListItem, FolderTreeNode, MaterialType } from "@/modules/material-library";

/* ============================================================
   类型元信息（克制配色，沿用字节蓝中台体系）
   ============================================================ */
const TYPE_META: Record<
  MaterialType,
  { label: string; icon: typeof Film; tint: string; chip: string }
> = {
  video: {
    label: "视频",
    icon: Film,
    tint: "from-blue-50 to-blue-100 text-blue-500",
    chip: "bg-blue-50 text-blue-600",
  },
  audio: {
    label: "音频",
    icon: Music,
    tint: "from-purple-50 to-purple-100 text-purple-500",
    chip: "bg-purple-50 text-purple-600",
  },
  image: {
    label: "图片",
    icon: ImageIcon,
    tint: "from-emerald-50 to-emerald-100 text-emerald-500",
    chip: "bg-emerald-50 text-emerald-600",
  },
  other: {
    label: "文件",
    icon: FileIcon,
    tint: "from-slate-50 to-slate-100 text-slate-500",
    chip: "bg-slate-100 text-slate-600",
  },
};

const TYPE_TABS: { key: MaterialType | "all"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "video", label: "视频" },
  { key: "audio", label: "音频" },
  { key: "image", label: "图片" },
  { key: "other", label: "文件" },
];

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
];
function avatarColor(name: string) {
  return AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];
}
function formatDuration(sec: number | null): string | null {
  if (sec == null) return null;
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}
function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function inlineUrl(id: number) {
  return `/api/materials/download?id=${id}&inline=1`;
}
function downloadUrl(id: number) {
  return `/api/materials/download?id=${id}`;
}

/* 收集某目录及其所有子孙 id（用于父目录筛选） */
function collectIds(node: FolderTreeNode): number[] {
  return [node.id, ...node.children.flatMap(collectIds)];
}
function findNode(nodes: FolderTreeNode[], id: number): FolderTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const f = findNode(n.children, id);
    if (f) return f;
  }
  return null;
}
/* 拍平为 {id,label} 供上传目录下拉 */
function flattenFolders(nodes: FolderTreeNode[], prefix = ""): { id: number; label: string }[] {
  return nodes.flatMap((n) => {
    const label = prefix ? `${prefix} / ${n.name}` : n.name;
    return [{ id: n.id, label }, ...flattenFolders(n.children, label)];
  });
}

/* ============================================================
   主组件
   ============================================================ */
export function MaterialLibrary({
  folders,
  initialAssets,
  currentUserId,
}: {
  folders: FolderTreeNode[];
  initialAssets: AssetListItem[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [activeFolderId, setActiveFolderId] = useState<number | null>(null);
  const [quickFilter, setQuickFilter] = useState<"all" | "fav" | "mine">("all");
  const [activeType, setActiveType] = useState<MaterialType | "all">("all");
  const [keyword, setKeyword] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [openFolders, setOpenFolders] = useState<Set<number>>(
    () => new Set(folders.map((f) => f.id)),
  );
  const [detailId, setDetailId] = useState<number | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());

  const detail = detailId != null ? (initialAssets.find((a) => a.id === detailId) ?? null) : null;
  const favCount = useMemo(() => initialAssets.filter((a) => a.favorited).length, [initialAssets]);
  const mineCount = useMemo(
    () => initialAssets.filter((a) => a.uploadedByUserId === currentUserId).length,
    [initialAssets, currentUserId],
  );

  const allTags = useMemo(() => {
    const s = new Set<string>();
    initialAssets.forEach((a) => a.tags.forEach((t) => s.add(t)));
    return Array.from(s);
  }, [initialAssets]);

  // 当前选中目录（含子孙）的 id 集
  const folderScope = useMemo(() => {
    if (activeFolderId == null) return null;
    const node = findNode(folders, activeFolderId);
    return node ? new Set(collectIds(node)) : new Set([activeFolderId]);
  }, [activeFolderId, folders]);

  const filtered = useMemo(() => {
    return initialAssets.filter((a) => {
      if (quickFilter === "fav" && !a.favorited) return false;
      if (quickFilter === "mine" && a.uploadedByUserId !== currentUserId) return false;
      if (folderScope && (a.folderId == null || !folderScope.has(a.folderId))) return false;
      if (activeType !== "all" && a.type !== activeType) return false;
      if (keyword.trim()) {
        const k = keyword.trim().toLowerCase();
        if (!a.name.toLowerCase().includes(k) && !a.tags.some((t) => t.toLowerCase().includes(k)))
          return false;
      }
      if (activeTags.length && !activeTags.every((t) => a.tags.includes(t))) return false;
      return true;
    });
  }, [initialAssets, folderScope, activeType, keyword, activeTags, quickFilter, currentUserId]);

  const currentFolderName = activeFolderId != null ? findNode(folders, activeFolderId)?.name : null;
  const viewTitle =
    quickFilter === "fav"
      ? "我的收藏"
      : quickFilter === "mine"
        ? "我的上传"
        : (currentFolderName ?? "全部素材");

  // 选目录时清掉快捷筛选；选快捷入口时清掉目录
  function selectFolder(id: number | null) {
    setActiveFolderId(id);
    setQuickFilter("all");
  }
  function selectQuick(q: "all" | "fav" | "mine") {
    setQuickFilter(q);
    setActiveFolderId(null);
  }

  function toggleFolderOpen(id: number) {
    setOpenFolders((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleTagFilter(tag: string) {
    setActiveTags((p) => (p.includes(tag) ? p.filter((t) => t !== tag) : [...p, tag]));
  }
  function toggleFav(id: number) {
    startTransition(async () => {
      try {
        await toggleFavorite({ assetId: id });
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "收藏失败");
      }
    });
  }

  function saveTags(id: number, tags: string[]) {
    startTransition(async () => {
      try {
        await updateAsset({ id, tags });
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "保存标签失败");
      }
    });
  }
  function renameAsset(id: number, name: string) {
    startTransition(async () => {
      try {
        await updateAsset({ id, name });
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "重命名失败");
      }
    });
  }
  function moveAsset(id: number, folderId: number | null) {
    startTransition(async () => {
      try {
        await updateAsset({ id, folderId });
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "移动失败");
      }
    });
  }
  function handleDelete(id: number) {
    if (!confirm("确定删除这个素材？删除后不可恢复。")) return;
    startTransition(async () => {
      try {
        await deleteAsset({ id });
        setDetailId(null);
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "删除失败");
      }
    });
  }

  // ——— 批量操作 ———
  function toggleSelect(id: number) {
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function selectAllVisible(ids: number[]) {
    setSelected((p) => {
      const allSelected = ids.length > 0 && ids.every((i) => p.has(i));
      if (allSelected) return new Set();
      return new Set(ids);
    });
  }
  function clearSelection() {
    setSelected(new Set());
  }
  function batchMove(folderId: number | null) {
    const ids = Array.from(selected);
    if (!ids.length) return;
    startTransition(async () => {
      try {
        await batchMoveAssets({ ids, folderId });
        clearSelection();
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "批量移动失败");
      }
    });
  }
  function batchDelete() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`确定删除选中的 ${ids.length} 个素材？删除后不可恢复。`)) return;
    startTransition(async () => {
      try {
        await batchDeleteAssets({ ids });
        clearSelection();
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "批量删除失败");
      }
    });
  }

  // ——— 目录操作 ———
  function addSubfolder(parentId: number) {
    const name = window.prompt("新建子目录名称");
    if (!name?.trim()) return;
    startTransition(async () => {
      try {
        await createFolder({ name: name.trim(), parentId });
        setOpenFolders((p) => new Set(p).add(parentId)); // 展开父目录看到新建项
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "新建子目录失败");
      }
    });
  }
  function renameFolderHandler(id: number, oldName: string) {
    const name = window.prompt("重命名目录", oldName);
    if (!name?.trim() || name.trim() === oldName) return;
    startTransition(async () => {
      try {
        await renameFolder({ id, name: name.trim() });
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "重命名失败");
      }
    });
  }
  function deleteFolderHandler(id: number) {
    if (!confirm("确定删除这个目录？（只能删空目录，里面有子目录或素材时删不了）")) return;
    startTransition(async () => {
      try {
        await deleteFolder({ id });
        if (activeFolderId === id) setActiveFolderId(null);
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "删除目录失败");
      }
    });
  }

  return (
    <div className="flex h-[calc(100vh-8.5rem)] min-h-[540px] overflow-hidden">
      {/* ============ 左栏 ============ */}
      <aside className="flex w-60 shrink-0 flex-col border-r bg-card/40">
        <div className="px-3 py-4">
          <div className="flex items-center gap-2 px-2 pb-3 text-base font-semibold">
            <FolderOpen className="size-5 text-primary" />
            素材库
          </div>
          <nav className="space-y-0.5">
            <SideLink
              icon={LayoutGrid}
              label="全部素材"
              count={initialAssets.length}
              active={quickFilter === "all" && activeFolderId == null}
              onClick={() => selectQuick("all")}
            />
            <SideLink
              icon={Heart}
              label="我的收藏"
              count={favCount}
              active={quickFilter === "fav"}
              onClick={() => selectQuick("fav")}
            />
            <SideLink
              icon={Clock}
              label="我的上传"
              count={mineCount}
              active={quickFilter === "mine"}
              onClick={() => selectQuick("mine")}
            />
          </nav>
        </div>
        <div className="flex items-center justify-between px-5 py-1.5 text-xs font-semibold text-muted-foreground">
          <span>分类目录</span>
          <NewFolderButton onCreated={() => router.refresh()} />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <div className="space-y-0.5">
            {folders.map((f) => (
              <FolderRow
                key={f.id}
                node={f}
                open={openFolders.has(f.id)}
                activeId={activeFolderId}
                onToggle={toggleFolderOpen}
                onSelect={selectFolder}
                openSet={openFolders}
                onAddSub={addSubfolder}
                onRename={renameFolderHandler}
                onDelete={deleteFolderHandler}
              />
            ))}
          </div>
        </div>
      </aside>

      {/* ============ 主区 ============ */}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span>素材库</span>
              {currentFolderName && <ChevronRight className="size-3.5" />}
              <span className="text-xl font-semibold text-foreground">{viewTitle}</span>
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">
              剪辑师共建的通用游戏素材，即取即用
            </p>
          </div>
          <Button onClick={() => setUploadOpen(true)} className="gap-1.5">
            <Upload className="size-4" />
            上传素材
          </Button>
        </div>

        {/* 工具条 */}
        <div className="flex flex-wrap items-center gap-3 px-6 py-4">
          <div className="inline-flex rounded-lg bg-muted p-0.5">
            {TYPE_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveType(t.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] transition-colors",
                  activeType === t.key
                    ? "bg-card font-semibold text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.key !== "all" && (
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      t.key === "video" && "bg-blue-500",
                      t.key === "audio" && "bg-purple-500",
                      t.key === "image" && "bg-emerald-500",
                      t.key === "other" && "bg-slate-400",
                    )}
                  />
                )}
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索素材名称 / 标签…"
              className="h-9 pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {allTags.slice(0, 8).map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTagFilter(tag)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  activeTags.includes(tag)
                    ? "border-primary/30 bg-accent font-medium text-primary"
                    : "bg-card text-muted-foreground hover:border-primary/30 hover:text-primary",
                )}
              >
                {tag}
              </button>
            ))}
            {activeTags.length > 0 && (
              <button
                onClick={() => setActiveTags([])}
                className="flex items-center gap-1 px-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" /> 清除
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 px-6 pb-2 text-[13px] text-muted-foreground">
          共 <span className="font-medium text-foreground">{filtered.length}</span> 个素材
          {isPending && <Loader2 className="size-3.5 animate-spin" />}
          {filtered.length > 0 && (
            <button
              onClick={() => selectAllVisible(filtered.map((a) => a.id))}
              className="ml-1 text-primary hover:underline"
            >
              {filtered.length > 0 && filtered.every((a) => selected.has(a.id))
                ? "取消全选"
                : "全选"}
            </button>
          )}
        </div>

        {/* 批量操作栏 */}
        {selected.size > 0 && (
          <div className="mx-6 mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-accent px-4 py-2.5">
            <span className="text-[13px] font-medium text-primary">已选 {selected.size} 个</span>
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <FolderInput className="size-4 text-muted-foreground" />
                <select
                  defaultValue=""
                  disabled={isPending}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) batchMove(v === "none" ? null : Number(v));
                    e.target.value = "";
                  }}
                  className="h-8 rounded-md border bg-background px-2 text-[13px] outline-none focus:border-primary disabled:opacity-60"
                >
                  <option value="" disabled>
                    移动到…
                  </option>
                  <option value="none">未分类</option>
                  {flattenFolders(folders).map((f) => (
                    <option key={f.id} value={String(f.id)}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={batchDelete}
                disabled={isPending}
                className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[13px] text-destructive hover:bg-destructive hover:text-white disabled:opacity-60"
              >
                <Trash2 className="size-3.5" /> 删除
              </button>
              <button
                onClick={clearSelection}
                className="rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground hover:text-foreground"
              >
                取消
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {filtered.length === 0 ? (
            <div className="grid place-items-center py-24 text-center text-muted-foreground">
              <FileUp className="mb-3 size-10 opacity-40" />
              {initialAssets.length === 0
                ? "还没有素材，点右上「上传素材」开始"
                : "没有符合条件的素材，换个筛选或搜索词试试"}
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
              {filtered.map((a) => (
                <MaterialCard
                  key={a.id}
                  asset={a}
                  selected={selected.has(a.id)}
                  selectionActive={selected.size > 0}
                  onToggleSelect={() => toggleSelect(a.id)}
                  onOpen={() => setDetailId(a.id)}
                  onFav={() => toggleFav(a.id)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ============ 居中预览弹窗（与剪辑工作台一致） ============ */}
      {detail && (
        <MaterialPreviewModal
          asset={detail}
          folders={folders}
          isPending={isPending}
          onClose={() => setDetailId(null)}
          onToggleFav={() => toggleFav(detail.id)}
          onSaveTags={(tags) => saveTags(detail.id, tags)}
          onRename={(name) => renameAsset(detail.id, name)}
          onMove={(folderId) => moveAsset(detail.id, folderId)}
          onDelete={() => handleDelete(detail.id)}
        />
      )}

      {/* ============ 上传弹窗 ============ */}
      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        folders={folders}
        defaultFolderId={activeFolderId}
        onDone={() => router.refresh()}
      />
    </div>
  );
}

/* ============================================================
   子组件
   ============================================================ */
function FolderRow({
  node,
  open,
  activeId,
  onToggle,
  onSelect,
  openSet,
  onAddSub,
  onRename,
  onDelete,
  depth = 0,
}: {
  node: FolderTreeNode;
  open: boolean;
  activeId: number | null;
  onToggle: (id: number) => void;
  onSelect: (id: number) => void;
  openSet: Set<number>;
  onAddSub: (parentId: number) => void;
  onRename: (id: number, oldName: string) => void;
  onDelete: (id: number) => void;
  depth?: number;
}) {
  const hasChildren = node.children.length > 0;
  return (
    <div>
      <div
        className={cn(
          "group/row flex items-center gap-1.5 rounded-md pr-1 text-sm hover:bg-accent",
          activeId === node.id ? "bg-accent font-medium text-primary" : "text-foreground/80",
        )}
        style={{ paddingLeft: depth ? depth * 14 + 8 : 8 }}
      >
        <button
          onClick={() => {
            onSelect(node.id);
            if (hasChildren) onToggle(node.id);
          }}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left"
        >
          {hasChildren ? (
            <ChevronRight
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-90",
              )}
            />
          ) : (
            <span className="size-3.5 shrink-0" />
          )}
          <Folder className="size-4 shrink-0 text-amber-500" />
          <span className="truncate">{node.name}</span>
        </button>
        {/* 计数（hover 时让位给操作按钮） */}
        <span className="text-xs tabular-nums text-muted-foreground group-hover/row:hidden">
          {node.count}
        </span>
        <div className="hidden items-center gap-0.5 group-hover/row:flex">
          <FolderAction title="新建子目录" onClick={() => onAddSub(node.id)}>
            <Plus className="size-3.5" />
          </FolderAction>
          <FolderAction title="重命名" onClick={() => onRename(node.id, node.name)}>
            <Pencil className="size-3" />
          </FolderAction>
          <FolderAction title="删除目录" danger onClick={() => onDelete(node.id)}>
            <Trash2 className="size-3" />
          </FolderAction>
        </div>
      </div>
      {open && hasChildren && (
        <div className="ml-[18px] border-l pl-1">
          {node.children.map((c) => (
            <FolderRow
              key={c.id}
              node={c}
              open={openSet.has(c.id)}
              activeId={activeId}
              onToggle={onToggle}
              onSelect={onSelect}
              openSet={openSet}
              onAddSub={onAddSub}
              onRename={onRename}
              onDelete={onDelete}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FolderAction({
  title,
  danger,
  onClick,
  children,
}: {
  title: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "grid size-5 place-items-center rounded text-muted-foreground hover:bg-background",
        danger ? "hover:text-destructive" : "hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}

function SideLink({
  icon: Icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: typeof Film;
  label: string;
  count: number;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] transition-colors",
        active
          ? "bg-accent font-semibold text-primary"
          : "text-foreground/75 hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span>{label}</span>
      <span className="ml-auto text-[11.5px] tabular-nums text-muted-foreground">{count}</span>
    </button>
  );
}

function Thumb({ asset }: { asset: AssetListItem }) {
  const meta = TYPE_META[asset.type];
  const Icon = meta.icon;
  if (asset.type === "image") {
    return (
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={inlineUrl(asset.id)}
          alt={asset.name}
          className="size-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "relative grid aspect-[16/10] place-items-center overflow-hidden bg-gradient-to-br",
        meta.tint,
      )}
    >
      <Icon className="size-10 opacity-50" />
      {asset.type === "video" && (
        <span className="absolute grid size-11 place-items-center rounded-full border border-white/70 bg-white/30 text-white backdrop-blur-sm">
          <Play className="size-5 fill-white" />
        </span>
      )}
    </div>
  );
}

function MaterialCard({
  asset,
  selected,
  selectionActive,
  onToggleSelect,
  onOpen,
  onFav,
}: {
  asset: AssetListItem;
  selected: boolean;
  selectionActive: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onFav: () => void;
}) {
  const meta = TYPE_META[asset.type];
  const dur = formatDuration(asset.durationSec);
  const fav = asset.favorited;
  return (
    <div
      onClick={onOpen}
      className={cn(
        "group cursor-pointer overflow-hidden rounded-xl border bg-card transition-all hover:-translate-y-0.5 hover:shadow-md",
        selected && "ring-2 ring-primary",
      )}
    >
      <div className="relative">
        <Thumb asset={asset} />
        {/* 选择复选框 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          className={cn(
            "absolute left-2 top-2 z-20 grid size-5 place-items-center rounded border transition-opacity",
            selected
              ? "border-primary bg-primary text-white"
              : "border-white/80 bg-black/30 text-transparent",
            selected || selectionActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
          aria-label="选择"
        >
          <Check className="size-3.5" />
        </button>
        <span
          className={cn(
            "absolute bottom-2 left-2 rounded-md px-2 py-0.5 text-[11px] font-semibold",
            meta.chip,
          )}
        >
          {meta.label}
        </span>
        {dur && (
          <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
            {dur}
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFav();
          }}
          className={cn(
            "absolute right-2 top-2 z-10 grid size-7 place-items-center rounded-full bg-white/90 shadow-sm transition-opacity",
            fav ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          <Star
            className={cn(
              "size-3.5",
              fav ? "fill-amber-400 text-amber-500" : "text-muted-foreground",
            )}
          />
        </button>
        {/* hover 浮出：预览 / 下载 */}
        <div className="absolute inset-0 flex items-end justify-center gap-5 bg-gradient-to-t from-black/55 via-black/0 to-transparent pb-3 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-foreground shadow hover:bg-white"
          >
            <Eye className="size-3.5" /> 预览
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              window.location.href = downloadUrl(asset.id);
            }}
            className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90"
          >
            <Download className="size-3.5" /> 下载
          </button>
        </div>
      </div>
      <div className="p-3">
        <div className="truncate text-[13.5px] font-semibold">{asset.name}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {asset.tags.slice(0, 4).map((t) => (
            <span
              key={t}
              className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground"
            >
              {t}
            </span>
          ))}
        </div>
        <div className="mt-2.5 flex items-center gap-2 text-[11.5px] text-muted-foreground">
          {asset.uploadedByName && (
            <>
              <span
                className={cn(
                  "grid size-[18px] place-items-center rounded-full text-[9px] font-bold text-white",
                  avatarColor(asset.uploadedByName),
                )}
              >
                {asset.uploadedByName[0]}
              </span>
              <span>{asset.uploadedByName}</span>
            </>
          )}
          <span className="ml-auto flex items-center gap-1">
            <Download className="size-3" />
            {asset.downloadCount}
          </span>
        </div>
      </div>
    </div>
  );
}

/* 居中大预览（video 自动播放 / image 适配 / audio 播放器） */
function PreviewMedia({ asset }: { asset: AssetListItem }) {
  if (asset.type === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={inlineUrl(asset.id)}
        alt={asset.name}
        className="max-h-[60vh] max-w-full rounded object-contain"
      />
    );
  }
  if (asset.type === "video") {
    return (
      <video
        src={inlineUrl(asset.id)}
        controls
        autoPlay
        className="max-h-[60vh] max-w-full rounded bg-black"
      />
    );
  }
  if (asset.type === "other") {
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-3 py-10 text-white/80">
        <div className="grid size-20 place-items-center rounded-2xl bg-white/10">
          <FileIcon className="size-9" />
        </div>
        <div className="text-sm">{(asset.format || "文件").toUpperCase()} 文件，无法在线预览</div>
        <div className="text-xs text-white/50">下载后用对应软件打开（如 PSD 用 Photoshop）</div>
      </div>
    );
  }
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4 py-10">
      <div className="grid size-20 place-items-center rounded-full bg-white/10">
        <Music className="size-9 text-white/80" />
      </div>
      <audio src={inlineUrl(asset.id)} controls autoPlay className="w-full" />
    </div>
  );
}

/* 居中预览弹窗 —— 与剪辑工作台一致（点外面 / Esc 关闭） */
function MaterialPreviewModal({
  asset,
  folders,
  isPending,
  onClose,
  onToggleFav,
  onSaveTags,
  onRename,
  onMove,
  onDelete,
}: {
  asset: AssetListItem;
  folders: FolderTreeNode[];
  isPending: boolean;
  onClose: () => void;
  onToggleFav: () => void;
  onSaveTags: (tags: string[]) => void;
  onRename: (name: string) => void;
  onMove: (folderId: number | null) => void;
  onDelete: () => void;
}) {
  const flatFolders = useMemo(() => flattenFolders(folders), [folders]);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(asset.name);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape" && !editingName) onClose();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose, editingName]);

  function commitName() {
    const n = nameDraft.trim();
    setEditingName(false);
    if (n && n !== asset.name) onRename(n);
  }

  const meta = TYPE_META[asset.type];
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={cn("shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold", meta.chip)}
            >
              {meta.label}
            </span>
            {editingName ? (
              <input
                autoFocus
                value={nameDraft}
                disabled={isPending}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitName();
                  else if (e.key === "Escape") {
                    setNameDraft(asset.name);
                    setEditingName(false);
                  }
                }}
                onBlur={commitName}
                className="min-w-0 flex-1 rounded-md border px-2 py-1 text-sm font-semibold outline-none focus:border-primary"
              />
            ) : (
              <>
                <span className="truncate font-semibold">{asset.name}</span>
                <button
                  onClick={() => {
                    setNameDraft(asset.name);
                    setEditingName(true);
                  }}
                  className="shrink-0 text-muted-foreground hover:text-primary"
                  title="重命名"
                >
                  <Pencil className="size-3.5" />
                </button>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded hover:bg-muted"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>
        {/* media */}
        <div className="flex min-h-[200px] items-center justify-center bg-black/90 p-3">
          <PreviewMedia asset={asset} />
        </div>
        {/* info + tags */}
        <div className="overflow-y-auto px-5 py-3.5">
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-muted-foreground">
            {asset.format && (
              <span>
                格式 <b className="font-medium text-foreground">{asset.format.toUpperCase()}</b>
              </span>
            )}
            {asset.width && asset.height && (
              <span>
                尺寸{" "}
                <b className="font-medium text-foreground">
                  {asset.width}×{asset.height}
                </b>
              </span>
            )}
            {asset.durationSec != null && (
              <span>
                时长{" "}
                <b className="font-medium text-foreground">{formatDuration(asset.durationSec)}</b>
              </span>
            )}
            <span>
              大小 <b className="font-medium text-foreground">{formatSize(asset.fileSize)}</b>
            </span>
            <span>
              上传 <b className="font-medium text-foreground">{asset.uploadedByName ?? "—"}</b>
            </span>
            <span>
              下载 <b className="font-medium text-foreground">{asset.downloadCount}</b> 次
            </span>
          </div>
          {/* 归属目录（可改，传错了在这里移动） */}
          <div className="mt-3 flex items-center gap-2">
            <span className="shrink-0 text-xs font-semibold text-muted-foreground">归属目录</span>
            <select
              value={asset.folderId ?? "none"}
              disabled={isPending}
              onChange={(e) => onMove(e.target.value === "none" ? null : Number(e.target.value))}
              className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-[13px] outline-none focus:border-primary disabled:opacity-60"
            >
              <option value="none">未分类</option>
              {flatFolders.map((f) => (
                <option key={f.id} value={String(f.id)}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3 mb-1.5 text-xs font-semibold text-muted-foreground">
            标签（回车添加）
          </div>
          <TagInput
            value={asset.tags}
            onChange={onSaveTags}
            placeholder="加标签…"
            disabled={isPending}
          />
        </div>
        {/* footer */}
        <div className="flex gap-2 border-t px-5 py-3">
          <Button
            className="flex-1 gap-1.5"
            onClick={() => {
              window.location.href = downloadUrl(asset.id);
            }}
          >
            <Download className="size-4" /> 下载
          </Button>
          <Button
            variant="outline"
            className={cn("gap-1.5", asset.favorited && "text-amber-600")}
            onClick={onToggleFav}
            disabled={isPending}
          >
            <Star className={cn("size-4", asset.favorited && "fill-amber-400 text-amber-500")} />
            {asset.favorited ? "已收藏" : "收藏"}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="text-destructive hover:bg-destructive hover:text-white"
            onClick={onDelete}
            disabled={isPending}
            aria-label="删除"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function NewFolderButton({ onCreated }: { onCreated: () => void }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        const name = window.prompt("新建顶级目录名称");
        if (!name || !name.trim()) return;
        start(async () => {
          try {
            await createFolder({ name: name.trim(), parentId: null });
            onCreated();
          } catch (e) {
            alert(e instanceof Error ? e.message : "新建目录失败");
          }
        });
      }}
      className="grid size-5 place-items-center rounded hover:bg-accent hover:text-primary"
      title="新建顶级目录"
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
    </button>
  );
}

/* ============ 上传弹窗（真实上传） ============ */
interface FileMeta {
  durationSec?: number;
  width?: number;
  height?: number;
}
function readMeta(file: File): Promise<FileMeta> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const done = (m: FileMeta) => {
      URL.revokeObjectURL(url);
      resolve(m);
    };
    if (file.type.startsWith("video")) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () =>
        done({ durationSec: Math.round(v.duration), width: v.videoWidth, height: v.videoHeight });
      v.onerror = () => done({});
      v.src = url;
    } else if (file.type.startsWith("audio")) {
      const a = document.createElement("audio");
      a.preload = "metadata";
      a.onloadedmetadata = () => done({ durationSec: Math.round(a.duration) });
      a.onerror = () => done({});
      a.src = url;
    } else if (file.type.startsWith("image")) {
      const img = new window.Image();
      img.onload = () => done({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => done({});
      img.src = url;
    } else done({});
  });
}

function UploadDialog({
  open,
  onOpenChange,
  folders,
  defaultFolderId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  folders: FolderTreeNode[];
  defaultFolderId: number | null;
  onDone: () => void;
}) {
  const flat = useMemo(() => flattenFolders(folders), [folders]);
  const [target, setTarget] = useState<string>(defaultFolderId ? String(defaultFolderId) : "none");
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);

  // webkitdirectory 不在 React input 类型里，用 ref 设置（文件夹上传）
  useEffect(() => {
    const el = dirRef.current;
    if (el) {
      el.setAttribute("webkitdirectory", "");
      el.setAttribute("directory", "");
    }
  }, []);

  async function doUpload(files: FileList) {
    setBusy(true);
    setError(null);
    // 过滤系统隐藏文件（.DS_Store / Thumbs.db / 以 . 开头）
    const arr = Array.from(files).filter((f) => !f.name.startsWith(".") && f.name !== "Thumbs.db");
    setProgress({ done: 0, total: arr.length });
    let ok = 0;
    for (let i = 0; i < arr.length; i++) {
      const file = arr[i];
      if (!file) continue;
      try {
        const meta = await readMeta(file);
        const fd = new FormData();
        fd.append("file", file);
        if (target !== "none") fd.append("folderId", target);
        fd.append("tags", JSON.stringify(tags));
        if (meta.durationSec) fd.append("durationSec", String(meta.durationSec));
        if (meta.width) fd.append("width", String(meta.width));
        if (meta.height) fd.append("height", String(meta.height));
        const res = await fetch("/api/materials/upload", { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "上传失败");
        ok++;
      } catch (e) {
        setError(`${file.name}：${e instanceof Error ? e.message : "上传失败"}`);
      }
      setProgress({ done: i + 1, total: arr.length });
    }
    setBusy(false);
    if (ok > 0) {
      onDone();
      setTags([]);
      onOpenChange(false);
    }
    setProgress(null);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>上传素材</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="video/*,audio/*,image/*,.psd,.psb,.ai,.eps,.aep,.prproj,.zip,.rar,.7z"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length) doUpload(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={dirRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length) doUpload(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="grid w-full cursor-pointer place-items-center rounded-xl border-2 border-dashed px-5 py-9 text-center text-muted-foreground transition-colors hover:border-primary hover:bg-accent disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 className="mb-3 size-10 animate-spin text-primary" />
                <div className="text-sm font-medium text-foreground">
                  上传中 {progress?.done}/{progress?.total}…
                </div>
              </>
            ) : (
              <>
                <FileUp className="mb-3 size-10 text-blue-400" />
                <div className="text-sm font-medium text-foreground">点击选择文件（可多选）</div>
                <div className="mt-1 text-xs">
                  视频 / 音频 / 图片 / PSD 等源文件 · 也可整个文件夹上传
                </div>
              </>
            )}
          </button>
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
              归属目录
            </label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              disabled={busy}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary disabled:opacity-60"
            >
              <option value="none">未分类</option>
              {flat.map((f) => (
                <option key={f.id} value={String(f.id)}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
              标签（回车分隔，便于检索）
            </label>
            <TagInput
              value={tags}
              onChange={setTags}
              placeholder="如：爆奖、竖屏、无字幕…"
              disabled={busy}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            关闭
          </Button>
          <Button
            variant="outline"
            onClick={() => dirRef.current?.click()}
            disabled={busy}
            className="gap-1.5"
          >
            <FolderUp className="size-4" />
            上传文件夹
          </Button>
          <Button onClick={() => fileRef.current?.click()} disabled={busy} className="gap-1.5">
            <Upload className="size-4" />
            选择文件
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
