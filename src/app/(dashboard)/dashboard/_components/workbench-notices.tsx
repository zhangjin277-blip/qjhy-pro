"use client";

import { useState } from "react";
import { Bell, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  publishNotice,
  deleteNotice,
  readNotices,
  type WorkbenchData,
  type WorkbenchNotice,
} from "@/modules/dashboard";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import styles from "./workbench.module.css";

export function WorkbenchNotices({
  section,
  reload,
}: {
  section: WorkbenchData["notices"];
  reload: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<WorkbenchNotice | null>(null);
  const [allOpen, setAllOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const items = section.data?.items ?? [];
  const unread = items.filter((item) => !item.read);

  async function openNotice(notice: WorkbenchNotice) {
    setConfirmingDelete(false);
    setSelected(notice);
    if (notice.read) return;
    try {
      const result = await readNotices([notice.id]);
      if (!result.ok) toast.error(result.error);
      else await reload();
    } catch {
      toast.error("已读状态保存失败，请重试");
    }
  }
  async function removeNotice() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const result = await deleteNotice(selected.id);
      if (!result.ok) toast.error(result.error);
      else {
        toast.success("公告已删除");
        setSelected(null);
        setConfirmingDelete(false);
        await reload();
      }
    } catch {
      toast.error("公告删除失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  }
  async function readAll() {
    setBusy(true);
    try {
      const result = await readNotices(unread.map((item) => item.id));
      if (!result.ok) toast.error(result.error);
      else {
        toast.success("公告已全部标记为已读");
        await reload();
      }
    } catch {
      toast.error("已读状态保存失败，请重试");
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const result = await publishNotice({
        title: form.get("title"),
        body: form.get("body"),
        category: form.get("category"),
        pinned: form.get("pinned") === "on",
      });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success("公告已发布");
        setPublishing(false);
        await reload();
      }
    } catch {
      toast.error("公告发布失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  }
  function rows(notices: WorkbenchNotice[]) {
    return notices.map((notice) => (
      <button
        type="button"
        key={notice.id}
        className={styles.noticeRow}
        onClick={() => void openNotice(notice)}
      >
        <span className={styles.noticeTitle}>
          {!notice.read && <i className={styles.unreadDot} aria-label="未读" />}
          {notice.pinned && <span className={styles.pin}>置顶</span>}
          <span>{notice.title}</span>
        </span>
        <span className={styles.noticeMeta}>
          <span>
            {notice.publisher} · {notice.category}
          </span>
          <time>
            {new Date(notice.publishedAt).toLocaleDateString("zh-CN", {
              timeZone: "Asia/Shanghai",
              month: "2-digit",
              day: "2-digit",
            })}
          </time>
        </span>
      </button>
    ));
  }
  return (
    <section id="workbench-notices" className={styles.panel}>
      <header className={styles.panelHeader}>
        <h2>
          <Bell />
          公告通知{unread.length > 0 && <span className={styles.badge}>{unread.length} 未读</span>}
        </h2>
        {section.data?.canPublish && (
          <button type="button" className={styles.textLink} onClick={() => setPublishing(true)}>
            <Plus size={13} />
            发布
          </button>
        )}
      </header>
      <div className={styles.noticeList}>
        {section.error ? (
          <p className={styles.empty}>{section.error}</p>
        ) : items.length === 0 ? (
          <div className={styles.empty}>
            <Bell size={26} />
            <p>暂无公告</p>
            <span>公司通知、制度更新与活动消息将在这里展示</span>
          </div>
        ) : (
          rows(items.slice(0, 3))
        )}
      </div>
      <footer className={styles.panelFoot}>
        <button
          type="button"
          className={styles.textLink}
          disabled={busy || unread.length === 0}
          onClick={() => void readAll()}
        >
          全部标为已读
        </button>
        <button type="button" className={styles.textLink} onClick={() => setAllOpen(true)}>
          查看全部 ›
        </button>
      </footer>
      <Dialog open={allOpen} onOpenChange={setAllOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogTitle>公告通知</DialogTitle>
          <DialogDescription>最近 100 条公告</DialogDescription>
          <div className="max-h-[60vh] overflow-y-auto">
            {items.length ? rows(items) : <p className={styles.empty}>暂无公告</p>}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setSelected(null);
            setConfirmingDelete(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogTitle>{selected?.title}</DialogTitle>
          <DialogDescription>
            {selected?.publisher} · {selected?.category} ·{" "}
            {selected &&
              new Date(selected.publishedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
          </DialogDescription>
          <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words leading-7">
            {selected?.body}
          </div>
          {section.data?.canPublish && (
            <div className="space-y-3 border-t pt-4">
              {confirmingDelete && (
                <p className="text-sm text-muted-foreground" role="alert">
                  确认删除这条公告？删除后所有用户将无法在工作台查看。
                </p>
              )}
              <div className="flex justify-end gap-2">
                {confirmingDelete ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setConfirmingDelete(false)}
                    >
                      取消
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => void removeNotice()}
                    >
                      {busy ? "删除中…" : "确认删除"}
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => setConfirmingDelete(true)}
                  >
                    <Trash2 size={14} />
                    删除公告
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={publishing}
        onOpenChange={(open) => {
          if (!busy) setPublishing(open);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogTitle>发布公告</DialogTitle>
          <DialogDescription>发布后，所有登录用户均可在工作台查看。</DialogDescription>
          <form onSubmit={submit} className="space-y-4">
            <label className="block space-y-2">
              <span>公告标题</span>
              <Input name="title" required maxLength={100} placeholder="请输入标题" />
            </label>
            <label className="block space-y-2">
              <span>公告正文</span>
              <Textarea
                name="body"
                required
                maxLength={10000}
                rows={7}
                placeholder="请输入通知内容"
              />
            </label>
            <div className="flex items-center justify-between gap-4">
              <label className="flex items-center gap-2">
                分类
                <select name="category" className="rounded border p-1.5">
                  <option>通知</option>
                  <option>制度</option>
                  <option>活动</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                <input name="pinned" type="checkbox" />
                置顶公告
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setPublishing(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "发布中…" : "确认发布"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
