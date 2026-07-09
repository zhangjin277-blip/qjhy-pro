"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  HardDriveDownload,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PromptDialog } from "@/components/ui/prompt-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createCategory,
  deleteCategory,
  deleteItem,
  fetchItems,
  renameCategory,
  updateItem,
  type SoftwareCategoryItem,
  type SoftwareListItem,
} from "@/modules/software-library";

type CategoryFilter = "all" | "none" | number;

interface Props {
  initialCategories: SoftwareCategoryItem[];
  initialItems: SoftwareListItem[];
  initialTotal: number;
  canEdit: boolean;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** 首字渐变头像：按软件名哈希取固定渐变色，取首个字符（含中文/emoji 代理对安全）。 */
const AVATAR_GRADIENTS = [
  "from-sky-400 to-blue-600",
  "from-violet-400 to-purple-600",
  "from-emerald-400 to-teal-600",
  "from-amber-400 to-orange-500",
  "from-rose-400 to-pink-600",
  "from-cyan-400 to-sky-600",
  "from-indigo-400 to-violet-600",
  "from-lime-400 to-green-600",
] as const;

function avatarGradient(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length] ?? "from-sky-400 to-blue-600";
}

function avatarChar(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? "?";
}

export function SoftwareLibrary({ initialCategories, initialItems, initialTotal, canEdit }: Props) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [activeCat, setActiveCat] = useState<CategoryFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [isPending, startTransition] = useTransition();

  // server component 重新渲染（revalidatePath 后）同步 props
  const activeCatRef = useRef(activeCat);
  activeCatRef.current = activeCat;
  const keywordRef = useRef(keyword);
  keywordRef.current = keyword;

  useEffect(() => setCategories(initialCategories), [initialCategories]);
  useEffect(() => {
    // revalidatePath/router.refresh 的 RSC payload 是无筛选全量；
    // 筛选状态下接受它会覆盖 reload() 的筛选结果，故仅无筛选时同步
    if (activeCatRef.current === "all" && !keywordRef.current.trim()) {
      setItems(initialItems);
      setTotal(initialTotal);
    }
  }, [initialItems, initialTotal]);

  const reload = useCallback(
    (cat: CategoryFilter, kw: string) => {
      startTransition(async () => {
        try {
          const r = await fetchItems({
            category: cat === "all" ? undefined : cat,
            keyword: kw.trim() || undefined,
            page: 1,
            pageSize: 100,
          });
          setItems(r.items);
          setTotal(r.total);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "加载失败");
        }
      });
    },
    [startTransition],
  );

  // 搜索防抖
  const kwTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (kwTimer.current) clearTimeout(kwTimer.current);
    },
    [],
  );
  function onKeywordChange(v: string) {
    setKeyword(v);
    if (kwTimer.current) clearTimeout(kwTimer.current);
    kwTimer.current = setTimeout(() => reload(activeCat, v), 300);
  }

  function switchCategory(cat: CategoryFilter) {
    if (kwTimer.current) clearTimeout(kwTimer.current);
    setActiveCat(cat);
    reload(cat, keyword);
  }

  // ---- 分类管理 ----
  const [createCatOpen, setCreateCatOpen] = useState(false);
  const [renameCat, setRenameCat] = useState<SoftwareCategoryItem | null>(null);
  const [deleteCat, setDeleteCat] = useState<SoftwareCategoryItem | null>(null);

  async function handleCreateCategory(name: string) {
    try {
      await createCategory({ name });
      toast.success("分类已创建");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建分类失败");
    }
  }

  async function handleRenameCategory(name: string) {
    if (!renameCat) return;
    try {
      await renameCategory({ id: renameCat.id, name });
      toast.success("分类已重命名");
      reload(activeCat, keyword);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重命名失败");
    }
  }

  async function handleDeleteCategory() {
    if (!deleteCat) return;
    try {
      await deleteCategory({ id: deleteCat.id });
      toast.success("分类已删除");
      if (activeCat === deleteCat.id) switchCategory("all");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  // ---- 上传 / 编辑 / 删除条目 ----
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editItem, setEditItem] = useState<SoftwareListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SoftwareListItem | null>(null);

  async function handleDeleteItem() {
    if (!deleteTarget) return;
    try {
      await deleteItem({ id: deleteTarget.id });
      toast.success("已删除");
      reload(activeCat, keyword);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  return (
    <div className="p-4">
      <div className="bg-card rounded-xl border">
        {/* 标题 + 搜索 + 上传 */}
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <HardDriveDownload className="text-primary h-4.5 w-4.5" />
          <h1 className="text-[15px] font-semibold">软件库</h1>
          <span className="text-muted-foreground text-xs">{total} 个软件</span>
          <div className="relative ml-auto w-56">
            <Search className="text-muted-foreground absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
            <Input
              value={keyword}
              onChange={(e) => onKeywordChange(e.target.value)}
              placeholder="搜索软件名/文件名"
              className="h-8 pl-8 text-[13px]"
            />
          </div>
          {canEdit && (
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <Upload className="mr-1 h-3.5 w-3.5" />
              上传软件
            </Button>
          )}
        </div>

        {/* 顶部分类 chips */}
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
          <CategoryChip
            label="全部"
            active={activeCat === "all"}
            onClick={() => switchCategory("all")}
          />
          <CategoryChip
            label="未分类"
            active={activeCat === "none"}
            onClick={() => switchCategory("none")}
          />
          {categories.map((c) => (
            <CategoryChip
              key={c.id}
              label={c.name}
              count={c.itemCount}
              active={activeCat === c.id}
              onClick={() => switchCategory(c.id)}
              onRename={canEdit ? () => setRenameCat(c) : undefined}
              onDelete={canEdit ? () => setDeleteCat(c) : undefined}
            />
          ))}
          {canEdit && (
            <button
              type="button"
              onClick={() => setCreateCatOpen(true)}
              className="text-muted-foreground hover:border-primary/40 hover:text-primary flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-[12px] transition-colors"
            >
              <Plus className="h-3 w-3" />
              新建分类
            </button>
          )}
        </div>

        {/* 卡片网格 */}
        {items.length === 0 ? (
          <div className="text-muted-foreground flex h-48 items-center justify-center text-sm">
            {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "暂无软件"}
          </div>
        ) : (
          <div
            className={cn(
              "grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6",
              isPending && "opacity-60",
            )}
          >
            {items.map((it) => (
              <SoftwareCard
                key={it.id}
                item={it}
                canEdit={canEdit}
                onEdit={() => setEditItem(it)}
                onDelete={() => setDeleteTarget(it)}
              />
            ))}
          </div>
        )}
        {total > items.length && (
          <p className="text-muted-foreground border-t px-4 py-2 text-[11px]">
            仅显示前 {items.length} 条，可用搜索或分类缩小范围
          </p>
        )}
      </div>

      {/* 弹窗集合 */}
      <PromptDialog
        open={createCatOpen}
        title="新建分类"
        placeholder="如：直播工具 / 办公软件"
        maxLength={30}
        onOpenChange={setCreateCatOpen}
        onConfirm={handleCreateCategory}
      />
      <PromptDialog
        open={renameCat != null}
        title="重命名分类"
        defaultValue={renameCat?.name ?? ""}
        maxLength={30}
        onOpenChange={(o) => !o && setRenameCat(null)}
        onConfirm={handleRenameCategory}
      />
      <ConfirmDialog
        open={deleteCat != null}
        title={`删除分类「${deleteCat?.name ?? ""}」？`}
        description="分类下还有软件时无法删除。"
        variant="danger"
        onOpenChange={(o) => !o && setDeleteCat(null)}
        onConfirm={handleDeleteCategory}
      />
      <ConfirmDialog
        open={deleteTarget != null}
        title={`删除「${deleteTarget?.name ?? ""}」？`}
        description="删除后列表不再展示（NAS 文件保留，可联系管理员恢复）。"
        variant="danger"
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        onConfirm={handleDeleteItem}
      />
      {uploadOpen && (
        <UploadDialog
          categories={categories}
          defaultCategoryId={typeof activeCat === "number" ? activeCat : null}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            setUploadOpen(false);
            reload(activeCat, keyword);
            router.refresh();
          }}
        />
      )}
      {editItem && (
        <EditDialog
          item={editItem}
          categories={categories}
          onClose={() => setEditItem(null)}
          onSaved={() => {
            setEditItem(null);
            reload(activeCat, keyword);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function CategoryChip({
  label,
  count,
  active,
  onClick,
  onRename,
  onDelete,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasMenu = Boolean(onRename || onDelete);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <div ref={ref} className="relative">
      <div
        className={cn(
          "flex items-center rounded-full border text-[12px] transition-colors",
          active
            ? "border-primary bg-primary text-primary-foreground"
            : "text-foreground/80 hover:border-primary/40 hover:text-primary bg-card",
        )}
      >
        <button
          type="button"
          onClick={onClick}
          className={cn("flex items-center gap-1.5 py-1 pl-3", hasMenu ? "pr-1.5" : "pr-3")}
        >
          <span className="max-w-[120px] truncate">{label}</span>
          {count != null && (
            <span
              className={cn(
                "rounded-full px-1.5 text-[10px] tabular-nums",
                active ? "bg-white/25" : "bg-muted text-muted-foreground",
              )}
            >
              {count}
            </span>
          )}
        </button>
        {hasMenu && (
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className={cn(
              "mr-1.5 rounded-full p-0.5",
              active ? "hover:bg-white/25" : "hover:bg-muted text-muted-foreground",
            )}
          >
            <MoreHorizontal className="h-3 w-3" />
          </button>
        )}
      </div>
      {menuOpen && (
        <div className="border-border bg-card absolute top-full left-0 z-20 mt-1 w-[100px] rounded-lg border p-1 shadow-lg">
          {onRename && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onRename();
              }}
              className="hover:bg-muted flex w-full items-center gap-1.5 rounded px-2 py-1 text-[12px]"
            >
              <Pencil className="h-3 w-3" /> 重命名
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
              className="text-destructive hover:bg-muted flex w-full items-center gap-1.5 rounded px-2 py-1 text-[12px]"
            >
              <Trash2 className="h-3 w-3" /> 删除
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SoftwareCard({
  item,
  canEdit,
  onEdit,
  onDelete,
}: {
  item: SoftwareListItem;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group border-border/70 bg-card relative flex flex-col rounded-xl border p-3.5 transition-shadow hover:shadow-md">
      {canEdit && (
        <div className="absolute top-2 right-2 z-10 hidden gap-0.5 group-hover:flex">
          <button
            type="button"
            onClick={onEdit}
            className="text-muted-foreground hover:text-primary bg-card hover:bg-muted rounded-md border p-1 shadow-sm"
            aria-label="编辑"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive bg-card hover:bg-muted rounded-md border p-1 shadow-sm"
            aria-label="删除"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* 首字渐变图标 */}
      <div className="flex justify-center py-4">
        <div
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br text-2xl font-semibold text-white shadow-sm",
            avatarGradient(item.name),
          )}
        >
          {avatarChar(item.name)}
        </div>
      </div>

      {/* 分类 · 版本 */}
      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="bg-primary h-1.5 w-1.5 shrink-0 rounded-full" />
        <span className="text-primary truncate">{item.categoryName ?? "未分类"}</span>
        {item.version && <span className="text-muted-foreground shrink-0">· {item.version}</span>}
      </div>

      {/* 名称 */}
      <div className="mt-1 line-clamp-2 text-[13px] leading-snug font-semibold" title={item.name}>
        {item.name}
      </div>

      {/* 说明（空则回退原始文件名） */}
      <p className="text-muted-foreground mt-1 mb-2 line-clamp-2 min-h-[32px] text-[12px] leading-4">
        {item.note ?? item.fileName}
      </p>

      {/* 底部：大小/下载数 + 下载按钮 */}
      <div className="mt-auto flex items-center justify-between border-t pt-2">
        <span
          className="text-muted-foreground text-[11px] tabular-nums"
          title={`${item.uploadedByName ?? "-"} 上传于 ${formatDate(item.uploadedAt)} · ${item.fileName}`}
        >
          {formatSize(item.fileSize)} · {item.downloadCount} 次下载
        </span>
        <a
          href={`/api/software/download?id=${item.id}`}
          download
          className={cn(
            buttonVariants({ variant: "default", size: "sm" }),
            "h-6.5 rounded-full px-2.5 text-[11px]",
          )}
        >
          <Download className="mr-0.5 h-3 w-3" />
          下载
        </a>
      </div>
    </div>
  );
}

function UploadDialog({
  categories,
  defaultCategoryId,
  onClose,
  onUploaded,
}: {
  categories: SoftwareCategoryItem[];
  defaultCategoryId: number | null;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string>(
    defaultCategoryId != null ? String(defaultCategoryId) : "none",
  );
  const [version, setVersion] = useState("");
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  function pickFile(f: File | null) {
    setFile(f);
    if (f && !name.trim()) setName(f.name.replace(/\.[^.]+$/, ""));
  }

  function submit() {
    if (!file) {
      toast.error("请先选择文件");
      return;
    }
    const fd = new FormData();
    fd.append("name", name.trim());
    fd.append("categoryId", categoryId === "none" ? "" : categoryId);
    fd.append("version", version.trim());
    fd.append("note", note.trim());
    fd.append("file", file); // file 放最后：busboy 之前的 fields 才能在文件流前解析到

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", "/api/software/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setProgress(null);
      try {
        const res = JSON.parse(xhr.responseText) as {
          ok?: boolean;
          deduped?: boolean;
          error?: string;
        };
        if (xhr.status === 200 && res.ok) {
          toast.success(
            res.deduped ? "该文件已存在，直接复用已有条目（本次填写的信息未生效）" : "上传成功",
          );
          onUploaded();
        } else {
          toast.error(res.error ?? `上传失败（${xhr.status}）`);
        }
      } catch {
        toast.error(`上传失败（${xhr.status}）`);
      }
    };
    xhr.onerror = () => {
      setProgress(null);
      toast.error("网络错误，上传失败");
    };
    setProgress(0);
    xhr.send(fd);
  }

  function cancel() {
    xhrRef.current?.abort();
    onClose();
  }

  const uploading = progress != null;

  return (
    <Dialog open onOpenChange={(o) => !o && !uploading && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>上传软件</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">安装包文件</Label>
            <Input
              type="file"
              disabled={uploading}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              className="mt-1"
            />
            {file && (
              <p className="text-muted-foreground mt-1 text-[11px]">
                {file.name}（{formatSize(file.size)}）
              </p>
            )}
          </div>
          <div>
            <Label className="text-xs">软件名称</Label>
            <Input
              value={name}
              disabled={uploading}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：OBS 直播推流"
              maxLength={120}
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">分类</Label>
              <Select
                value={categoryId}
                onValueChange={(v) => setCategoryId(v ?? "none")}
                disabled={uploading}
              >
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未分类</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">版本号（选填）</Label>
              <Input
                value={version}
                disabled={uploading}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="如：v30.2"
                maxLength={60}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">说明备注（选填）</Label>
            <Textarea
              value={note}
              disabled={uploading}
              onChange={(e) => setNote(e.target.value)}
              placeholder="一句话说明用途，如：直播伴侣，装播必备"
              maxLength={300}
              rows={2}
              className="mt-1"
            />
          </div>
          {uploading && (
            <div>
              <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-muted-foreground mt-1 text-center text-[11px]">
                {progress}%（大文件请勿关闭页面）
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={cancel}>
            取消
          </Button>
          <Button size="sm" onClick={submit} disabled={!file || uploading}>
            {uploading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            {uploading ? "上传中…" : "开始上传"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  item,
  categories,
  onClose,
  onSaved,
}: {
  item: SoftwareListItem;
  categories: SoftwareCategoryItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [categoryId, setCategoryId] = useState<string>(
    item.categoryId != null ? String(item.categoryId) : "none",
  );
  const [version, setVersion] = useState(item.version ?? "");
  const [note, setNote] = useState(item.note ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      toast.error("名称不能为空");
      return;
    }
    setSaving(true);
    try {
      await updateItem({
        id: item.id,
        name: name.trim(),
        categoryId: categoryId === "none" ? null : Number(categoryId),
        version: version.trim() || null,
        note: note.trim() || null,
      });
      toast.success("已保存");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>编辑软件信息</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">软件名称</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">分类</Label>
              <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? "none")}>
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未分类</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">版本号</Label>
              <Input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                maxLength={60}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">说明备注</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              rows={2}
              className="mt-1"
            />
          </div>
          <p className="text-muted-foreground text-[11px]">
            原始文件：{item.fileName}（{formatSize(item.fileSize)}）—
            文件本体不可改，需要换包请删除后重传
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
