"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ApprovalPreview } from "@/modules/dashboard";
import styles from "./workbench-management.module.css";
function safeLink(value: string | null) {
  return value && (/^https?:\/\//i.test(value) || /^\/(?!\/)/.test(value)) ? value : null;
}
export function WorkbenchApproval({
  item,
  canApprove,
  close,
  reload,
}: {
  item: ApprovalPreview | null;
  canApprove: boolean;
  close: () => void;
  reload: () => Promise<void>;
}) {
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function decide(action: "approve" | "reject") {
    if (!item || busy) return;
    if (action === "reject" && !remark.trim()) {
      setError("请填写驳回原因");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/procurement/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, remark }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message || "审批失败，请重试");
      toast.success(action === "approve" ? "已同意采购申请" : "已驳回采购申请");
      close();
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "审批失败");
    } finally {
      setBusy(false);
    }
  }
  let attachments: string[] = [];
  if (item?.screenshot) {
    try {
      const parsed = JSON.parse(item.screenshot);
      attachments = Array.isArray(parsed)
        ? parsed.filter((v): v is string => typeof v === "string")
        : [item.screenshot];
    } catch {
      attachments = [item.screenshot];
    }
  }
  return (
    <Dialog
      open={!!item}
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto" showCloseButton={!busy}>
        <DialogTitle>{canApprove ? "采购快捷审批" : "采购申请详情"}</DialogTitle>
        <DialogDescription>
          申请 #{item?.id} · {item?.submitter} ·{" "}
          {item && new Date(item.createdAt).toLocaleString("zh-CN")}
        </DialogDescription>
        {item && (
          <>
            <div className={styles.requestTitle}>
              <strong>{item.title}</strong>
              <b>¥{item.amount.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}</b>
            </div>
            <dl className={styles.requestFields}>
              {[
                ["单价 / 数量", `¥${item.price} × ${item.quantity}`],
                ["使用人", item.requester],
                ["采购平台", item.platform],
                ["发票", item.invoice],
                ["采购用途", item.usage],
                ["申请备注", item.remarks],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value || "未填写"}</dd>
                </div>
              ))}
            </dl>
            {safeLink(item.link) && (
              <a
                className="text-primary text-sm underline"
                href={safeLink(item.link) ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
              >
                查看商品链接 ↗
              </a>
            )}
            {attachments.filter(safeLink).map((url, i) => (
              <a
                key={i}
                className="text-primary text-sm underline"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
              >
                查看采购附件 {i + 1} ↗
              </a>
            ))}
            {canApprove && (
              <label className={styles.remark}>
                审批意见<span>驳回时必填</span>
                <textarea
                  value={remark}
                  maxLength={2000}
                  disabled={busy}
                  onChange={(event) => setRemark(event.target.value)}
                  placeholder="填写审批意见或驳回原因"
                />
              </label>
            )}
            {error && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <div className={styles.dialogActions}>
              <Button variant="outline" disabled={busy} onClick={close}>
                取消
              </Button>
              {canApprove && (
                <>
                  <Button variant="outline" disabled={busy} onClick={() => void decide("reject")}>
                    驳回
                  </Button>
                  <Button disabled={busy} onClick={() => void decide("approve")}>
                    {busy ? "正在提交…" : "同意申请"}
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
