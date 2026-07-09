"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  FolderPlus,
  HardDriveDownload,
  Loader2,
  MoreHorizontal,
  Pencil,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
    <div className="flex gap-4 p-4">
      {/* 左侧分类栏 */}
      <aside className="w-[180px] shrink-0">
        <div className="bg-card rounded-xl border p-2">
          <CategoryRow
            label="全部"
            active={activeCat === "all"}
            onClick={() => switchCategory("all")}
          />
          <CategoryRow
            label="未分类"
            active={activeCat === "none"}
            onClick={() => switchCategory("none")}
          />
          <div className="my-1.5 border-t" />
          {categories.map((c) => (
            <CategoryRow
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
              className="text-muted-foreground hover:text-primary mt-1 flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[12px]"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              新建分类
            </button>
          )}
        </div>
      </aside>

      {/* 右侧列表 */}
      <main className="min-w-0 flex-1">
        <div className="bg-card rounded-xl border">
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

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>分类</TableHead>
                <TableHead>版本</TableHead>
                <TableHead>说明</TableHead>
                <TableHead>大小</TableHead>
                <TableHead>上传人</TableHead>
                <TableHead>上传时间</TableHead>
                <TableHead className="text-right">下载次数</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-muted-foreground h-32 text-center">
                    {isPending ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : "暂无软件"}
                  </TableCell>
                </TableRow>
              )}
              {items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="max-w-[220px]">
                    <div className="truncate font-medium">{it.name}</div>
                    <div className="text-muted-foreground truncate text-[11px]">{it.fileName}</div>
                  </TableCell>
                  <TableCell className="text-[12px]">{it.categoryName ?? "未分类"}</TableCell>
                  <TableCell className="text-[12px]">{it.version ?? "-"}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[200px] truncate text-[12px]">
                    {it.note ?? "-"}
                  </TableCell>
                  <TableCell className="text-[12px] tabular-nums">
                    {formatSize(it.fileSize)}
                  </TableCell>
                  <TableCell className="text-[12px]">{it.uploadedByName ?? "-"}</TableCell>
                  <TableCell className="text-[12px] tabular-nums">
                    {formatDate(it.uploadedAt)}
                  </TableCell>
                  <TableCell className="text-right text-[12px] tabular-nums">
                    {it.downloadCount}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <a
                        href={`/api/software/download?id=${it.id}`}
                        download
                        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-7 px-2")}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                      {canEdit && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => setEditItem(it)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive h-7 px-2"
                            onClick={() => setDeleteTarget(it)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {total > items.length && (
            <p className="text-muted-foreground border-t px-4 py-2 text-[11px]">
              仅显示前 {items.length} 条，可用搜索或分类缩小范围
            </p>
          )}
        </div>
      </main>

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

function CategoryRow({
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

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <div ref={ref} className="group relative">
      <div
        className={cn(
          "flex w-full items-center gap-1.5 rounded pr-1 text-[13px] transition-colors",
          active
            ? "bg-primary/10 text-primary font-medium"
            : "text-foreground/80 hover:bg-[var(--hover-bg)]",
        )}
      >
        <button
          type="button"
          onClick={onClick}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-2 text-left"
        >
          <span className="min-w-0 flex-1 truncate">{label}</span>
        </button>
        {count != null && <span className="text-muted-foreground text-[11px]">{count}</span>}
        {(onRename || onDelete) && (
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="hover:bg-muted hidden rounded p-0.5 group-hover:block"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {menuOpen && (
        <div className="border-border bg-card absolute top-full right-0 z-20 mt-0.5 w-[100px] rounded-lg border p-1 shadow-lg">
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
