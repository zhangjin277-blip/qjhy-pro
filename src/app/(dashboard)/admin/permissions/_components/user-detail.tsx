"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  assignUserPosition,
  removeDeptLeader,
  setDeptLeader,
  upsertOverrideBatch,
  MODULE_KEYS,
  MODULE_LABEL,
  MODULE_DESC,
  MODULE_POINTS,
  type ModuleKey,
  type Scope,
  type ResolvedPermission,
} from "@/modules/permissions";
import { toast } from "sonner";
import { Crown, X as XIcon } from "lucide-react";
import { UserDeptTreePicker } from "./user-dept-tree-picker";

interface UserDetail {
  user_id: string;
  name: string;
  title: string | null;
  dept_ids: string[];
  dept_full: { dept_id: string; name: string; alias: string | null }[];
  assigned_position: string | null;
  effective_position: string;
  permissions: Record<ModuleKey, Omit<ResolvedPermission, "points"> & { points: string[] }>;
  overrides: {
    module: string;
    scope: Scope | null;
    /** null = 未覆盖（用岗位默认）；数组 = 整体替换 */
    points: string[] | null;
    reason: string | null;
  }[];
  managedDepts: { dept_id: string; name: string; alias: string | null }[];
  /** 委托视图：该用户当前 override 行里挂的 delegated 员工集合（并集） */
  delegated_users: { user_id: string; name: string }[];
}

interface UserListRow {
  user_id: string;
  name: string;
  title: string | null;
  dept_id: string | null;
  module_scopes: Record<ModuleKey, Scope>;
  module_points: Record<ModuleKey, string[]>;
}

interface DeptOption {
  dept_id: string;
  name: string;
  parent_id: string | null;
  alias: string | null;
}

/**
 * 构造部门完整路径，用于区分重名部门（如多个组都叫"一组"）。
 * 例：dept_id=运营·一组 → "运营 / 一组"；dept_id=孵化组·一组 → "孵化组 / 一组"
 */
function buildDeptPath(deptId: string, allDepts: DeptOption[]): string {
  const byId = new Map(allDepts.map((d) => [d.dept_id, d]));
  const segments: string[] = [];
  let cur = byId.get(deptId);
  let depth = 0;
  while (cur && depth < 8) {
    segments.unshift(cur.alias ?? cur.name);
    if (!cur.parent_id) break;
    cur = byId.get(cur.parent_id);
    depth++;
  }
  return segments.join(" / ");
}

const SCOPE_LABEL: Record<Scope, string> = {
  none: "无权限",
  self: "仅自己",
  team: "仅团队",
  all: "所有人",
};

const SCOPE_DOT: Record<Scope, string> = {
  none: "bg-muted-foreground/30",
  self: "bg-sky-500",
  team: "bg-violet-500",
  all: "bg-emerald-500",
};

/**
 * 抽屉内的工作状态：每个 module 用户当前选择的 scope（含 "default"）
 *  - "default" = 不写 override（沿用岗位默认）
 *  - "none" / "self" / "team" / "all" = 写 override 到该 scope
 */
type WorkingScope = Scope | "default";

const WORKING_OPTIONS: { value: WorkingScope; label: string }[] = [
  { value: "default", label: "使用默认" },
  { value: "self", label: "仅自己" },
  { value: "team", label: "仅团队" },
  { value: "all", label: "所有人" },
];

export function UserDetailPanel({ userId, onClose }: { userId: string; onClose?: () => void }) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [working, setWorking] = useState<Record<ModuleKey, WorkingScope>>(
    {} as Record<ModuleKey, WorkingScope>,
  );
  /** 每板块权限点覆盖：null = 用岗位默认；数组 = 整体替换 */
  const [workingPoints, setWorkingPoints] = useState<Record<ModuleKey, string[] | null>>(
    {} as never,
  );
  const [workingPosition, setWorkingPosition] = useState<string>("");
  const [positionOptions, setPositionOptions] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [reuseOpen, setReuseOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<UserListRow[]>([]);
  const [reuseFilter, setReuseFilter] = useState("");

  // 管理部门相关
  const [allDepts, setAllDepts] = useState<DeptOption[]>([]);
  const [deptPickerOpen, setDeptPickerOpen] = useState(false);
  const [deptFilter, setDeptFilter] = useState("");
  const [deptBusy, setDeptBusy] = useState(false);

  // 委托视图：picker 选中的员工 user_id 数组
  const [delegatedUserIds, setDelegatedUserIds] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/admin/users/${userId}`)
      .then((r) => r.json())
      .then((d: UserDetail) => {
        setDetail(d);
        // 初始化 working：根据 overrides 判断每 module 是 default 还是有 override
        const init: Record<ModuleKey, WorkingScope> = {} as Record<ModuleKey, WorkingScope>;
        const initPoints: Record<ModuleKey, string[] | null> = {} as never;
        for (const m of MODULE_KEYS) {
          const ov = d.overrides.find((x) => x.module === m);
          init[m] = ov?.scope ? (ov.scope as Scope) : "default";
          initPoints[m] = ov?.points ?? null;
        }
        setWorking(init);
        setWorkingPoints(initPoints);
        setWorkingPosition(d.effective_position);
        setDelegatedUserIds((d.delegated_users ?? []).map((u) => u.user_id));
      });
  }, [userId]);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json() as Promise<{ users: UserListRow[] }>)
      .then((d) => setAllUsers(d.users))
      .catch(() => setAllUsers([]));

    fetch("/api/admin/roles")
      .then((r) => r.json() as Promise<{ roles: { position: string }[] }>)
      .then((d) => {
        const positions = Array.from(new Set(d.roles.map((r) => r.position)));
        setPositionOptions(positions);
      })
      .catch(() => setPositionOptions([]));

    fetch("/api/admin/depts")
      .then((r) => r.json() as Promise<{ depts: DeptOption[] }>)
      .then((d) => setAllDepts(d.depts))
      .catch(() => setAllDepts([]));
  }, []);

  async function reloadDetail() {
    const r = await fetch(`/api/admin/users/${userId}`);
    if (!r.ok) return;
    const d = (await r.json()) as UserDetail;
    setDetail(d);
  }

  async function handleAddDept(deptId: string) {
    if (!deptId || deptBusy) return;
    setDeptBusy(true);
    try {
      await setDeptLeader({ dept_id: deptId, user_id: userId });
      await reloadDetail();
      setDeptPickerOpen(false);
      setDeptFilter("");
      window.dispatchEvent(new CustomEvent("permissions:refresh"));
      toast.success("已设为该部门负责人");
    } catch (e) {
      toast.error("设置失败：" + (e instanceof Error ? e.message : "未知错误"));
    } finally {
      setDeptBusy(false);
    }
  }

  async function handleRemoveDept(deptId: string) {
    if (deptBusy) return;
    setDeptBusy(true);
    try {
      await removeDeptLeader({ dept_id: deptId, user_id: userId });
      await reloadDetail();
      window.dispatchEvent(new CustomEvent("permissions:refresh"));
      toast.success("已移除部门负责人");
    } catch (e) {
      toast.error("移除失败：" + (e instanceof Error ? e.message : "未知错误"));
    } finally {
      setDeptBusy(false);
    }
  }

  const initialDelegatedKey = useMemo(() => {
    if (!detail) return "";
    return [...detail.delegated_users.map((u) => u.user_id)].sort().join(",");
  }, [detail]);
  const currentDelegatedKey = useMemo(
    () => [...delegatedUserIds].sort().join(","),
    [delegatedUserIds],
  );
  const delegatedDirty = initialDelegatedKey !== currentDelegatedKey;

  const dirty = useMemo(() => {
    if (!detail) return false;
    const keyOf = (arr: string[] | null | undefined) =>
      arr === null || arr === undefined ? "∅" : [...arr].sort().join(",");
    for (const m of MODULE_KEYS) {
      const ov = detail.overrides.find((x) => x.module === m);
      const initial: WorkingScope = ov?.scope ? (ov.scope as Scope) : "default";
      if (working[m] !== initial) return true;
      if (keyOf(workingPoints[m]) !== keyOf(ov?.points ?? null)) return true;
    }
    if (workingPosition !== detail.effective_position) return true;
    if (delegatedDirty) return true;
    return false;
  }, [detail, working, workingPoints, workingPosition, delegatedDirty]);

  const positionDirty = useMemo(() => {
    if (!detail) return false;
    return workingPosition !== detail.effective_position;
  }, [detail, workingPosition]);

  const openedCount = useMemo(() => {
    if (!detail) return 0;
    return MODULE_KEYS.filter((m) => detail.permissions[m].scope !== "none").length;
  }, [detail]);

  if (!detail) {
    return (
      <div className="grid h-full place-items-center text-muted-foreground text-sm">加载中...</div>
    );
  }

  function setModuleScope(m: ModuleKey, s: WorkingScope) {
    setWorking((prev) => ({ ...prev, [m]: s }));
  }

  async function handleSave() {
    if (!dirty) {
      onClose?.();
      return;
    }
    if (!reason.trim()) {
      toast.error("请填写变更理由");
      return;
    }
    setSaving(true);
    try {
      // 1. 岗位变化时先写岗位分配
      if (detail && positionDirty) {
        await assignUserPosition({
          user_id: userId,
          // 选择跟钉钉 title 相同 → 视为清除分配（让其回落到钉钉同步值）
          position: workingPosition === (detail.title ?? "") ? null : workingPosition,
          reason: reason.trim(),
        });
      }
      // 2. 写板块权限 override（含委托视图）
      const entries = MODULE_KEYS.map((m) => ({
        module: m,
        scope: working[m] === "default" ? null : (working[m] as Scope),
        points: workingPoints[m] ?? null,
      }));
      await upsertOverrideBatch({
        user_id: userId,
        reason: reason.trim(),
        entries,
        // delegated 显式传：空数组表示清空；非空表示设置
        delegated_user_ids: delegatedUserIds,
      });
      toast.success("权限保存成功");
      onClose?.();
      // 通知列表刷新
      window.dispatchEvent(new CustomEvent("permissions:refresh"));
    } catch (e) {
      toast.error("保存失败：" + (e instanceof Error ? e.message : "未知错误"));
    } finally {
      setSaving(false);
    }
  }

  function applyReuseFromUser(target: UserListRow) {
    const next: Record<ModuleKey, WorkingScope> = { ...working };
    const nextPoints: Record<ModuleKey, string[] | null> = { ...workingPoints };
    for (const m of MODULE_KEYS) {
      const s = target.module_scopes[m];
      // 若目标用户该 module = none 视为 default（即清掉 override）
      next[m] = s === "none" ? "default" : s;
      // 权限点：整体替换为目标用户的生效点集
      nextPoints[m] = [...(target.module_points?.[m] ?? [])];
    }
    setWorking(next);
    setWorkingPoints(nextPoints);
    setReuseOpen(false);
    setReuseFilter("");
    toast.success(`已套用 ${target.name} 的板块权限与权限点，记得填变更理由后保存`);
  }

  const filteredUsers = allUsers
    .filter((u) => u.user_id !== userId)
    .filter((u) => {
      if (!reuseFilter.trim()) return true;
      const q = reuseFilter.toLowerCase();
      return (
        u.name.toLowerCase().includes(q) ||
        (u.title?.toLowerCase().includes(q) ?? false) ||
        u.user_id.toLowerCase().includes(q)
      );
    })
    .slice(0, 20);

  return (
    <div className="flex h-full flex-col">
      {/* 顶部 Header（最简，由父 Sheet 提供 close） */}
      <div className="border-b px-6 py-4 shrink-0">
        <div className="text-base font-semibold">分配角色与权限</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          配置当前员工在各业务板块的可见与操作范围
        </div>
      </div>

      {/* 主体：双栏 */}
      <div className="flex flex-1 min-h-0">
        {/* 左 nav */}
        <nav className="w-[180px] shrink-0 border-r bg-muted/30 overflow-y-auto py-3 text-sm">
          <div className="px-3 py-1 text-[11px] uppercase tracking-wider text-muted-foreground/80">
            基本配置
          </div>
          <a href="#role" className="block px-3 py-2 hover:bg-accent">
            <span className="inline-block w-2 h-2 rounded-full bg-primary mr-2 align-middle" />
            岗位
          </a>
          <a href="#manage-depts" className="block px-3 py-2 hover:bg-accent">
            <span
              className={`inline-block w-2 h-2 rounded-full mr-2 align-middle ${
                detail.managedDepts.length > 0 ? "bg-amber-500" : "bg-muted-foreground/30"
              }`}
            />
            管理部门
            {detail.managedDepts.length > 0 && (
              <span className="ml-1 text-[11px] text-amber-600">·{detail.managedDepts.length}</span>
            )}
          </a>
          <a href="#delegated" className="block px-3 py-2 hover:bg-accent">
            <span
              className={`inline-block w-2 h-2 rounded-full mr-2 align-middle ${
                delegatedUserIds.length > 0 ? "bg-sky-500" : "bg-muted-foreground/30"
              }`}
            />
            委托视图
            {delegatedUserIds.length > 0 && (
              <span className="ml-1 text-[11px] text-sky-600">·{delegatedUserIds.length}</span>
            )}
          </a>

          <div className="px-3 pt-3 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground/80 flex items-center justify-between">
            <span>板块权限</span>
            <span className="text-primary font-medium">
              {openedCount}/{MODULE_KEYS.length}
            </span>
          </div>
          {MODULE_KEYS.map((m) => {
            const isOpen = detail.permissions[m].scope !== "none";
            return (
              <a key={m} href={`#${m}`} className="block px-3 py-2 hover:bg-accent">
                <span
                  className={`inline-block w-2 h-2 rounded-full mr-2 align-middle ${
                    isOpen ? "bg-emerald-500" : "bg-muted-foreground/30"
                  }`}
                />
                {MODULE_LABEL[m]}
              </a>
            );
          })}

          <div className="px-3 pt-3 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground/80">
            高级
          </div>
          <a href="#reuse" className="block px-3 py-2 hover:bg-accent">
            <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/30 mr-2 align-middle" />
            复用员工权限
          </a>
        </nav>

        {/* 右配置 */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 min-w-0">
          {/* 用户摘要卡 */}
          <section className="flex items-center gap-4 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4">
            <div className="bg-primary/15 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-medium">
              {detail.name.slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold">{detail.name}</span>
                {detail.title && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {detail.title}
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs text-muted-foreground truncate">
                📂{" "}
                {detail.dept_full?.length
                  ? detail.dept_full.map((d) => d.alias ?? d.name).join(" · ")
                  : "未分部门"}
              </div>
            </div>
            <div className="flex items-center gap-1 border-l pl-4 shrink-0">
              <div className="text-center min-w-[64px]">
                <div className="text-lg font-semibold text-primary tabular-nums leading-tight">
                  {openedCount}/{MODULE_KEYS.length}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground whitespace-nowrap">
                  板块开通
                </div>
              </div>
              <div className="text-center min-w-[64px]">
                <div className="text-lg font-semibold text-primary tabular-nums leading-tight">
                  {detail.overrides.length}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground whitespace-nowrap">
                  个体覆盖
                </div>
              </div>
            </div>
          </section>

          {/* 岗位 */}
          <section id="role" className="space-y-2 scroll-mt-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">岗位</div>
              {detail.assigned_position && (
                <span className="text-[11px] text-rose-600 font-medium">已手动分配</span>
              )}
            </div>
            <div>
              <Select value={workingPosition} onValueChange={(v) => setWorkingPosition(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="选择岗位" />
                </SelectTrigger>
                <SelectContent>
                  {positionOptions.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-2">
                岗位决定每个板块的默认权限基线（详见「岗位默认权限」tab）。
                {detail.title && <span className="ml-1">钉钉同步岗位：「{detail.title}」</span>}
                {detail.assigned_position && detail.title !== detail.assigned_position && (
                  <span className="ml-1">已被手动分配为「{detail.assigned_position}」覆盖。</span>
                )}
              </p>
            </div>
          </section>

          {/* 管理部门（设为部门负责人 = dept_leader 表） */}
          <section id="manage-depts" className="space-y-2 scroll-mt-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold inline-flex items-center gap-1.5">
                管理部门
                <span className="text-xs text-muted-foreground font-normal">
                  （可选 · 决定「仅团队」scope 看到的范围）
                </span>
              </div>
              {detail.managedDepts.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium">
                  <Crown className="h-3.5 w-3.5" />
                  部门负责人
                </span>
              )}
            </div>
            <div className="rounded-lg border bg-card p-3">
              {detail.managedDepts.length === 0 ? (
                <div className="text-xs text-muted-foreground">
                  未管理任何部门 — 该员工选「仅团队」时只能看到自己所在部门的数据；
                  如希望覆盖更多部门，下方添加。
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {detail.managedDepts.map((d) => {
                    const path = buildDeptPath(d.dept_id, allDepts);
                    return (
                      <span
                        key={d.dept_id}
                        className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900"
                        title={path || d.name}
                      >
                        <Crown className="h-3 w-3 text-amber-600 shrink-0" />
                        <span>{path || d.alias || d.name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveDept(d.dept_id)}
                          disabled={deptBusy}
                          className="ml-0.5 rounded-sm text-amber-700 hover:bg-amber-200 disabled:opacity-50"
                          aria-label={`移除 ${path || d.name}`}
                        >
                          <XIcon className="h-3 w-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="mt-2">
                {!deptPickerOpen ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDeptPickerOpen(true)}
                    disabled={deptBusy}
                  >
                    + 添加管理部门
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Input
                      placeholder="搜索部门名"
                      value={deptFilter}
                      onChange={(e) => setDeptFilter(e.target.value)}
                      autoFocus
                    />
                    <div className="max-h-[200px] overflow-auto rounded border bg-background">
                      {allDepts
                        .filter((d) => !detail.managedDepts.some((m) => m.dept_id === d.dept_id))
                        .filter((d) => {
                          if (!deptFilter.trim()) return true;
                          const q = deptFilter.toLowerCase();
                          return (
                            d.name.toLowerCase().includes(q) ||
                            (d.alias?.toLowerCase().includes(q) ?? false)
                          );
                        })
                        .slice(0, 50)
                        .map((d) => {
                          const path = buildDeptPath(d.dept_id, allDepts);
                          return (
                            <button
                              key={d.dept_id}
                              type="button"
                              onClick={() => handleAddDept(d.dept_id)}
                              disabled={deptBusy}
                              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
                            >
                              {path || d.alias || d.name}
                              {d.alias && d.alias !== d.name && (
                                <span className="ml-1 text-xs text-muted-foreground">
                                  · {d.name}
                                </span>
                              )}
                            </button>
                          );
                        })}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setDeptPickerOpen(false);
                        setDeptFilter("");
                      }}
                    >
                      取消
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* 范围说明表格 */}
            <details className="rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-xs">
              <summary className="cursor-pointer text-muted-foreground select-none">
                展开 · 「仅团队」scope 范围说明
              </summary>
              <div className="mt-2 overflow-hidden rounded border bg-background">
                <table className="w-full text-[11px]">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 text-left">情况</th>
                      <th className="px-2 py-1.5 text-left">看到什么</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t">
                      <td className="px-2 py-1.5">不勾选管理部门（普通组员）</td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        仅自己钉钉所在部门下成员负责的主播
                      </td>
                    </tr>
                    <tr className="border-t">
                      <td className="px-2 py-1.5">勾选 1 个部门（组长）</td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        所在部门 + 管理部门 下成员负责的主播
                      </td>
                    </tr>
                    <tr className="border-t">
                      <td className="px-2 py-1.5">勾选多个部门（总监 / 跨组管理）</td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        所在部门 + 全部勾选的管理部门 下成员负责的主播
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </details>
          </section>

          {/* 委托视图 */}
          <section id="delegated" className="space-y-2 scroll-mt-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">委托视图</h3>
              <span className="text-muted-foreground text-xs">
                （可选 · 直接以选中员工的「self」视角看主播 / 账号 / 投放数据；覆盖各板块 scope）
              </span>
            </div>
            <div className="rounded-xl border bg-card p-3">
              <UserDeptTreePicker
                selectedUserIds={delegatedUserIds}
                onChange={setDelegatedUserIds}
                excludeUserIds={[userId]}
              />
            </div>
          </section>

          {/* 复用 */}
          <section id="reuse" className="scroll-mt-4">
            <div className="rounded-xl border border-dashed border-primary bg-primary/5 px-4 py-3 flex items-center gap-3">
              <span className="text-lg">📋</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">快速复用其他员工权限</div>
                <div className="text-xs text-muted-foreground">
                  复制各板块数据范围 + 权限点（不复制岗位）
                </div>
              </div>
              <Button size="sm" onClick={() => setReuseOpen((v) => !v)}>
                {reuseOpen ? "收起" : "选择员工"}
              </Button>
            </div>

            {reuseOpen && (
              <div className="mt-2 rounded-xl border bg-card p-3 space-y-2">
                <Input
                  placeholder="搜索姓名 / 岗位 / userId"
                  value={reuseFilter}
                  onChange={(e) => setReuseFilter(e.target.value)}
                />
                <div className="max-h-[240px] overflow-auto -mx-1">
                  {filteredUsers.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-4">无匹配员工</div>
                  ) : (
                    filteredUsers.map((u) => (
                      <button
                        key={u.user_id}
                        type="button"
                        onClick={() => applyReuseFromUser(u)}
                        className="w-full px-2 py-2 rounded-md hover:bg-accent flex items-center gap-3 text-left"
                      >
                        <div className="bg-primary/10 text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium">
                          {u.name.slice(0, 1)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">
                            {u.name}{" "}
                            <span className="text-xs text-muted-foreground">
                              {u.title ?? "未填岗位"}
                            </span>
                          </div>
                          <div className="flex gap-1 mt-0.5">
                            {MODULE_KEYS.map((m) => {
                              const s = u.module_scopes?.[m] ?? "none";
                              return (
                                <span
                                  key={m}
                                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
                                >
                                  <span
                                    className={`inline-block w-1.5 h-1.5 rounded-full ${SCOPE_DOT[s]}`}
                                  />
                                  {MODULE_LABEL[m]}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                        <span className="text-xs text-primary font-medium shrink-0">复制 →</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </section>

          {/* 4 个板块卡 */}
          {MODULE_KEYS.map((m) => {
            const eff = detail.permissions[m]; // 当前生效权限（叠加后）
            const cur = working[m] ?? "default";
            const ov = detail.overrides.find((x) => x.module === m);
            const isOverridden = cur !== "default";
            return (
              <section
                key={m}
                id={m}
                className={`rounded-xl border bg-card scroll-mt-4 ${
                  isOverridden ? "border-primary/40 shadow-sm" : ""
                }`}
              >
                <div className="flex items-center gap-3 border-b px-4 py-3">
                  <div className="bg-primary/10 text-primary flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium">
                    {moduleEmoji(m)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{MODULE_LABEL[m]}</div>
                    <div className="text-[11px] text-muted-foreground">{MODULE_DESC[m]}</div>
                  </div>
                  <div className="text-xs text-right shrink-0">
                    <div className="text-muted-foreground">当前生效</div>
                    <div className="font-medium text-primary">
                      {SCOPE_LABEL[eff.scope]}
                      {ov && <span className="ml-1 text-[10px] text-rose-600">已覆盖</span>}
                    </div>
                  </div>
                </div>
                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs text-muted-foreground w-16 shrink-0">数据范围</span>
                    <div className="inline-flex rounded-md border bg-muted/50 p-0.5">
                      {WORKING_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setModuleScope(m, opt.value)}
                          className={`px-3 py-1 text-xs rounded transition-colors ${
                            cur === opt.value
                              ? "bg-background text-primary font-medium shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {MODULE_POINTS[m].length > 0 && (
                    <div className="flex items-start gap-3 flex-wrap">
                      <span className="text-xs text-muted-foreground w-16 shrink-0 pt-1.5">
                        权限点
                      </span>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="inline-flex rounded-md border bg-muted/50 p-0.5">
                          <button
                            type="button"
                            onClick={() => setWorkingPoints((prev) => ({ ...prev, [m]: null }))}
                            className={`px-3 py-1 text-xs rounded transition-colors ${
                              workingPoints[m] === null || workingPoints[m] === undefined
                                ? "bg-background text-primary font-medium shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            使用岗位默认
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setWorkingPoints((prev) => ({
                                ...prev,
                                // 进入自定义：以当前生效点集为起点
                                [m]: prev[m] ?? [...eff.points],
                              }))
                            }
                            className={`px-3 py-1 text-xs rounded transition-colors ${
                              workingPoints[m] !== null && workingPoints[m] !== undefined
                                ? "bg-background text-primary font-medium shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            自定义（{(workingPoints[m] ?? eff.points).length}/
                            {MODULE_POINTS[m].length}）
                          </button>
                        </div>
                        <div
                          className={`flex flex-wrap gap-x-4 gap-y-1 ${
                            workingPoints[m] === null || workingPoints[m] === undefined
                              ? "pointer-events-none opacity-50"
                              : ""
                          }`}
                        >
                          {MODULE_POINTS[m].map((d) => {
                            const activeSet = workingPoints[m] ?? eff.points;
                            const checked = activeSet.includes(d.key);
                            return (
                              <label
                                key={d.key}
                                className="flex cursor-pointer items-center gap-1 text-xs"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) =>
                                    setWorkingPoints((prev) => {
                                      const cur = new Set(prev[m] ?? eff.points);
                                      if (e.target.checked) cur.add(d.key);
                                      else cur.delete(d.key);
                                      return { ...prev, [m]: [...cur] };
                                    })
                                  }
                                  className="h-3.5 w-3.5"
                                />
                                {d.label}
                                {d.sensitive && (
                                  <span className="rounded bg-red-50 px-1 text-[10px] font-semibold text-red-600">
                                    敏
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            );
          })}

          <div className="h-4" />
        </div>
      </div>

      {/* Footer */}
      <div className="border-t bg-muted/40 px-6 py-3 flex items-center gap-3 shrink-0">
        <div className="flex-1 min-w-0">
          <Label className="text-[11px] text-muted-foreground">变更理由（必填）</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例：临时给该运营开 dashboard team 范围用于 X 项目"
            rows={1}
            className="mt-1 min-h-[34px] py-1.5 text-sm"
          />
        </div>
        <div className="flex gap-2 shrink-0 self-end">
          <Button variant="outline" onClick={() => onClose?.()} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving || !dirty}>
            {saving ? "保存中..." : dirty ? "保存配置" : "无变更"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function moduleEmoji(m: ModuleKey): string {
  switch (m) {
    case "dashboard":
      return "📊";
    case "project_zhaohua":
      return "🧭";
    case "project_ai_comic":
      return "✨";
    case "anchors":
      return "👥";
    case "crawler":
      return "🤖";
    case "permissions":
      return "🔐";
    case "live_account":
      return "🎬";
    case "live_anchor":
      return "🎤";
    case "live_room":
      return "📍";
    case "placement":
      return "💸";
    case "editing_workflow":
      return "✂️";
    case "software_library":
      return "🧰";
    case "recording":
      return "🎥";
    case "people_performance":
      return "📋";
    case "business_recruitment":
      return "📝";
    case "courses":
      return "📚";
  }
}
