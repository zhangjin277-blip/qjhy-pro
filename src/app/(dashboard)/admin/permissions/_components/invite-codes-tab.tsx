"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MODULE_KEYS, MODULE_LABEL, type ModuleKey, type Scope } from "@/modules/permissions";
import {
  formatInviteDisplayCode,
  generateInviteCodeAction,
  listInviteCodesAction,
  revokeInviteCodeAction,
  type InviteCodeRow,
  type InviteCodePermSpec,
} from "@/modules/invite-codes";
import { UserDeptTreePicker } from "./user-dept-tree-picker";

interface PermState {
  enabled: boolean;
  scope: Scope;
}

type PermsMap = Record<ModuleKey, PermState>;

const SCOPES: { value: Scope; label: string }[] = [
  { value: "none", label: "不可访问" },
  { value: "self", label: "仅本人" },
  { value: "team", label: "本团队" },
  { value: "all", label: "全公司" },
];

const EXPIRES_PRESETS: { value: string; label: string; days: number | null }[] = [
  { value: "never", label: "永不过期", days: null },
  { value: "1d", label: "1 天", days: 1 },
  { value: "7d", label: "7 天", days: 7 },
  { value: "30d", label: "30 天", days: 30 },
  { value: "90d", label: "90 天", days: 90 },
];

function expiresPresetToISO(preset: string): string | null {
  const found = EXPIRES_PRESETS.find((p) => p.value === preset);
  if (!found || found.days === null) return null;
  const d = new Date(Date.now() + found.days * 86400_000);
  return d.toISOString();
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const STATUS_LABEL: Record<InviteCodeRow["status"], { label: string; color: string }> = {
  active: { label: "可用", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  exhausted: { label: "用尽", color: "bg-slate-50 text-slate-600 border-slate-200" },
  expired: { label: "过期", color: "bg-amber-50 text-amber-700 border-amber-200" },
  revoked: { label: "已撤销", color: "bg-red-50 text-red-700 border-red-200" },
};

function emptyPerms(): PermsMap {
  const init = {} as PermsMap;
  for (const m of MODULE_KEYS) init[m] = { enabled: false, scope: "self" };
  return init;
}

export function InviteCodesTab() {
  const [rows, setRows] = useState<InviteCodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [justCreated, setJustCreated] = useState<{ display: string; url: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // 创建表单
  const [perms, setPerms] = useState<PermsMap>(emptyPerms());
  const [maxUses, setMaxUses] = useState(1);
  const [expiresPreset, setExpiresPreset] = useState("7d");
  const [accountExpiresPreset, setAccountExpiresPreset] = useState("never");
  const [note, setNote] = useState("");
  // 委托视图：选员工 = 注册账号将代他们的 self 视角看数据
  const [delegatedUserIds, setDelegatedUserIds] = useState<string[]>([]);

  async function reload() {
    setLoading(true);
    try {
      const data = await listInviteCodesAction();
      setRows(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  function resetForm() {
    setPerms(emptyPerms());
    setMaxUses(1);
    setExpiresPreset("7d");
    setAccountExpiresPreset("never");
    setNote("");
    setDelegatedUserIds([]);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const enabledPerms: InviteCodePermSpec[] = Object.entries(perms)
      .filter(([, v]) => v.enabled)
      .map(([k, v]) => ({
        module: k as ModuleKey,
        scope: v.scope,
        points: [] as string[], // 外部账号只读 + 委托视图，不给操作点
      }));

    if (enabledPerms.length === 0) {
      setError("至少勾选一个模块");
      return;
    }

    startTransition(async () => {
      try {
        const res = await generateInviteCodeAction({
          perms: enabledPerms,
          max_uses: maxUses,
          expires_at: expiresPresetToISO(expiresPreset),
          account_expire_at: expiresPresetToISO(accountExpiresPreset),
          note: note.trim() || null,
          delegated_user_ids: delegatedUserIds,
        });
        const url = `${window.location.origin}/register?code=${res.code}`;
        setJustCreated({ display: res.displayCode, url });
        setDialogOpen(false);
        resetForm();
        await reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : "生成失败");
      }
    });
  }

  function handleRevoke(code: string) {
    if (!confirm(`确认撤销邀请码 ${formatInviteDisplayCode(code)}？已注册的账号不受影响。`)) return;
    startTransition(async () => {
      try {
        await revokeInviteCodeAction({ code });
        await reload();
      } catch (err) {
        alert(err instanceof Error ? err.message : "撤销失败");
      }
    });
  }

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      alert(`${label}已复制`);
    } catch {
      alert("复制失败，请手动选择");
    }
  }

  return (
    <div className="space-y-3 py-3">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          为外部用户生成注册邀请码。注册成功后账号即可登录，权限按邀请码模板预设。
        </p>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          生成邀请码
        </Button>
      </div>

      {/* 新生成结果浮层 */}
      {justCreated && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-emerald-900">已生成邀请码</p>
              <p className="mt-1 font-mono text-lg tracking-wider text-emerald-900">
                {justCreated.display}
              </p>
              <p className="text-muted-foreground mt-1 break-all text-xs">
                注册 URL：<code>{justCreated.url}</code>
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(justCreated.display, "邀请码")}
              >
                复制码
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(justCreated.url, "URL")}
              >
                复制 URL
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setJustCreated(null)}>
                关闭
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 列表 */}
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="px-3 py-2">邀请码</th>
              <th className="px-3 py-2">状态</th>
              <th className="px-3 py-2">使用</th>
              <th className="px-3 py-2">模块</th>
              <th className="px-3 py-2">邀请码到期</th>
              <th className="px-3 py-2">账号到期</th>
              <th className="px-3 py-2">备注</th>
              <th className="px-3 py-2">创建人</th>
              <th className="px-3 py-2">创建时间</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} className="text-muted-foreground px-3 py-6 text-center text-xs">
                  加载中…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="text-muted-foreground px-3 py-6 text-center text-xs">
                  还没有邀请码，点右上角生成
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const s = STATUS_LABEL[r.status];
              return (
                <tr key={r.code} className="border-t">
                  <td className="px-3 py-2 font-mono">{formatInviteDisplayCode(r.code)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded border px-1.5 py-0.5 text-[11px] ${s.color}`}
                    >
                      {s.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.used_count} / {r.max_uses}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.perms.map((p) => MODULE_LABEL[p.module] ?? p.module).join(" / ")}
                  </td>
                  <td className="px-3 py-2 text-xs tabular-nums">{fmt(r.expires_at)}</td>
                  <td className="px-3 py-2 text-xs tabular-nums">{fmt(r.account_expire_at)}</td>
                  <td className="text-muted-foreground max-w-[180px] truncate px-3 py-2 text-xs">
                    {r.note ?? "—"}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-xs">
                    {r.created_by_name ?? r.created_by?.slice(0, 8) ?? "—"}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                    {fmt(r.created_at)}
                  </td>
                  <td className="px-3 py-2">
                    {r.status === "active" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRevoke(r.code)}
                        disabled={pending}
                        className="text-destructive h-7 px-2 text-xs"
                      >
                        撤销
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 生成对话框（受控） */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>生成新邀请码</DialogTitle>
            <DialogDescription>
              选模块权限 + 使用次数 + 有效期，生成后复制 URL 给对方。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>可访问模块</Label>
              <div className="space-y-1.5 rounded border p-2">
                {MODULE_KEYS.map((m) => (
                  <div key={m} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id={`perm-${m}`}
                      checked={perms[m].enabled}
                      onChange={(e) =>
                        setPerms({ ...perms, [m]: { ...perms[m], enabled: e.target.checked } })
                      }
                      className="h-4 w-4"
                    />
                    <Label htmlFor={`perm-${m}`} className="w-28 text-sm font-normal">
                      {MODULE_LABEL[m]}
                    </Label>
                    <select
                      value={perms[m].scope}
                      onChange={(e) =>
                        setPerms({
                          ...perms,
                          [m]: { ...perms[m], scope: e.target.value as Scope },
                        })
                      }
                      disabled={!perms[m].enabled}
                      className="h-7 rounded border px-2 text-xs disabled:opacity-50"
                    >
                      {SCOPES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="max-uses">最大使用次数</Label>
                <Input
                  id="max-uses"
                  type="number"
                  min={1}
                  max={1000}
                  value={maxUses}
                  onChange={(e) => setMaxUses(Number(e.target.value) || 1)}
                />
                <p className="text-muted-foreground text-xs">1=一次性；多人用同一码注册请设 N</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="exp">邀请码有效期</Label>
                <select
                  id="exp"
                  value={expiresPreset}
                  onChange={(e) => setExpiresPreset(e.target.value)}
                  className="border-input h-9 w-full rounded-md border px-2 text-sm"
                >
                  {EXPIRES_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="acc-exp">账号有效期（注册后账号本身的有效期）</Label>
              <select
                id="acc-exp"
                value={accountExpiresPreset}
                onChange={(e) => setAccountExpiresPreset(e.target.value)}
                className="border-input h-9 w-full rounded-md border px-2 text-sm"
              >
                {EXPIRES_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground text-xs">
                到期后该账号自动失效（不影响其他用同一码注册的账号）
              </p>
            </div>

            <div className="space-y-1">
              <Label>
                委托视图（可选）
                <span className="text-muted-foreground ml-1 text-xs font-normal">
                  选员工 = 注册账号将"代他们"看主播/账号/投放数据，覆盖上面的 scope
                </span>
              </Label>
              <UserDeptTreePicker
                selectedUserIds={delegatedUserIds}
                onChange={setDelegatedUserIds}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="note">备注</Label>
              <Input
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="如：给王总助理 / 二组合作主播 / 外包李某"
                maxLength={200}
              />
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "生成中…" : "生成"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
