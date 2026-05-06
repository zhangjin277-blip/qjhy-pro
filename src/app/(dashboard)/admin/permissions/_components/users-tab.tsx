"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Crown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserDetailPanel } from "./user-detail";
import { MODULE_KEYS, MODULE_LABEL, type ModuleKey, type Scope } from "@/modules/permissions";

interface UserRow {
  user_id: string;
  name: string;
  title: string | null;
  dept_ids: string[];
  dept_id: string | null;
  is_dept_leader: boolean;
  assigned_position: string | null;
  effective_position: string;
  module_scopes: Record<ModuleKey, Scope>;
  opened_count: number;
  total_count: number;
}

/** 显示用：手动分配的岗位 > 钉钉 title > "未填岗位" */
function displayPosition(u: UserRow): string {
  return u.assigned_position ?? u.title ?? "未填岗位";
}

interface DeptRow {
  dept_id: string;
  name: string;
  parent_id: string | null;
  alias: string | null;
  note: string | null;
}

interface DeptNode {
  dept_id: string;
  name: string;
  alias: string | null;
  note: string | null;
  parent_id: string | null;
  children: DeptNode[];
  users: UserRow[];
  totalUsers: number;
}

function deptDisplayName(node: { name: string; alias: string | null }): string {
  return node.alias ?? node.name;
}

function deptTooltip(node: { name: string; alias: string | null; note: string | null }): string {
  const parts: string[] = [];
  if (node.alias) parts.push(`原名：${node.name}`);
  if (node.note) parts.push(`备注：${node.note}`);
  return parts.join(" · ");
}

const ROOT_PARENT_ID = "1";

const SCOPE_LABEL: Record<Scope, string> = {
  none: "无",
  self: "仅自己",
  team: "仅团队",
  all: "所有人",
};

const SCOPE_TAG_CLASS: Record<Scope, string> = {
  none: "bg-muted/50 text-muted-foreground border-muted-foreground/20",
  self: "bg-sky-50 text-sky-700 border-sky-200",
  team: "bg-violet-50 text-violet-700 border-violet-200",
  all: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function ScopeCell({ scope }: { scope: Scope }) {
  return (
    <span
      className={`inline-flex h-5 items-center rounded border px-1.5 text-[11px] font-medium ${SCOPE_TAG_CLASS[scope]}`}
    >
      {SCOPE_LABEL[scope]}
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  const initial = name.slice(0, 1) || "?";
  return (
    <div className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium">
      {initial}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card rounded-lg border p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function buildDeptTree(depts: DeptRow[], users: UserRow[]): DeptNode[] {
  const nodeMap = new Map<string, DeptNode>();
  for (const d of depts) {
    nodeMap.set(d.dept_id, {
      dept_id: d.dept_id,
      name: d.name,
      alias: d.alias,
      note: d.note,
      parent_id: d.parent_id,
      children: [],
      users: [],
      totalUsers: 0,
    });
  }

  for (const u of users) {
    const matchedDeptId = u.dept_ids.find((id) => nodeMap.has(id));
    if (matchedDeptId) {
      const target = nodeMap.get(matchedDeptId);
      if (target) target.users.push(u);
    }
  }

  const roots: DeptNode[] = [];
  for (const node of nodeMap.values()) {
    const parent = node.parent_id ? nodeMap.get(node.parent_id) : undefined;
    if (parent) {
      parent.children.push(node);
    } else if (node.parent_id === ROOT_PARENT_ID || node.parent_id === null) {
      roots.push(node);
    } else {
      roots.push(node);
    }
  }

  function computeTotal(node: DeptNode): number {
    const childTotal = node.children.reduce((sum, c) => sum + computeTotal(c), 0);
    node.totalUsers = node.users.length + childTotal;
    return node.totalUsers;
  }
  roots.forEach(computeTotal);

  function sortNode(n: DeptNode) {
    n.children.sort((a, b) => deptDisplayName(a).localeCompare(deptDisplayName(b), "zh-CN"));
    n.users.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    n.children.forEach(sortNode);
  }
  roots.sort((a, b) => deptDisplayName(a).localeCompare(deptDisplayName(b), "zh-CN"));
  roots.forEach(sortNode);

  return roots;
}

interface DeptTreeNodeProps {
  node: DeptNode;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  selectedDeptId: string | null;
  onSelectDept: (id: string) => void;
  onSelectUser: (id: string) => void;
}

function DeptTreeNode({
  node,
  depth,
  expanded,
  toggle,
  selectedDeptId,
  onSelectDept,
  onSelectUser,
}: DeptTreeNodeProps) {
  const isOpen = expanded.has(node.dept_id);
  const hasContent = node.children.length > 0 || node.users.length > 0;
  const isSelected = selectedDeptId === node.dept_id;

  return (
    <div>
      <div
        className={`group hover:bg-muted/50 flex items-center gap-1 px-2 py-1.5 text-sm transition-colors ${
          isSelected ? "bg-accent" : ""
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <button
          type="button"
          onClick={() => toggle(node.dept_id)}
          className="flex shrink-0 items-center"
        >
          {hasContent ? (
            isOpen ? (
              <ChevronDown className="text-muted-foreground h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="text-muted-foreground h-3.5 w-3.5" />
            )
          ) : (
            <span className="w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onSelectDept(node.dept_id)}
          className="flex flex-1 items-center text-left"
          title={deptTooltip(node) || undefined}
        >
          <span className="font-medium">{deptDisplayName(node)}</span>
          {node.alias && (
            <span className="text-muted-foreground/60 ml-1 text-[11px]">· {node.name}</span>
          )}
          <span className="text-muted-foreground ml-1 text-xs">({node.totalUsers})</span>
        </button>
      </div>
      {isOpen && (
        <div>
          {node.children.map((child) => (
            <DeptTreeNode
              key={child.dept_id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              selectedDeptId={selectedDeptId}
              onSelectDept={onSelectDept}
              onSelectUser={onSelectUser}
            />
          ))}
          {node.users.map((u) => (
            <button
              key={u.user_id}
              type="button"
              onClick={() => onSelectUser(u.user_id)}
              className="hover:bg-muted/50 flex w-full items-center gap-2 px-2 py-1 text-left transition-colors"
              style={{ paddingLeft: `${(depth + 1) * 12 + 16}px` }}
            >
              <span className="text-muted-foreground/60 text-[11px]">·</span>
              <span className="text-sm">{u.name}</span>
              {u.is_dept_leader && (
                <Crown className="h-3 w-3 text-amber-500 shrink-0" aria-label="部门负责人" />
              )}
              <span className="text-muted-foreground text-xs">{displayPosition(u)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function findDeptNode(nodes: DeptNode[], deptId: string): DeptNode | null {
  for (const n of nodes) {
    if (n.dept_id === deptId) return n;
    const found = findDeptNode(n.children, deptId);
    if (found) return found;
  }
  return null;
}

function collectUsersInSubtree(node: DeptNode): UserRow[] {
  return [...node.users, ...node.children.flatMap(collectUsersInSubtree)];
}

export function UsersTab() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [depts, setDepts] = useState<DeptRow[]>([]);
  const [filter, setFilter] = useState("");
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function loadAll() {
    return Promise.all([
      fetch("/api/admin/users").then((r) => r.json() as Promise<{ users: UserRow[] }>),
      fetch("/api/admin/depts").then((r) => r.json() as Promise<{ depts: DeptRow[] }>),
    ]).then(([u, d]) => {
      setUsers(u.users);
      setDepts(d.depts);
      setLoading(false);
    });
  }

  useEffect(() => {
    loadAll().catch(() => setLoading(false));
    const handler = () => {
      loadAll().catch((err) => console.error("[permissions:refresh]", err));
    };
    window.addEventListener("permissions:refresh", handler);
    return () => window.removeEventListener("permissions:refresh", handler);
  }, []);

  const tree = useMemo(() => buildDeptTree(depts, users), [depts, users]);

  useEffect(() => {
    const firstRoot = tree[0];
    if (firstRoot) {
      if (expanded.size === 0) setExpanded(new Set(tree.map((r) => r.dept_id)));
      if (selectedDeptId === null) setSelectedDeptId(firstRoot.dept_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree.length]);

  function toggle(deptId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(deptId)) next.delete(deptId);
      else next.add(deptId);
      return next;
    });
  }

  function expandAll() {
    const all = new Set<string>();
    function collect(n: DeptNode) {
      all.add(n.dept_id);
      n.children.forEach(collect);
    }
    tree.forEach(collect);
    setExpanded(all);
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  if (loading) return <div className="text-muted-foreground p-4">加载中...</div>;

  const isSearching = filter.trim().length > 0;
  const flatFiltered = users.filter((u) => {
    const q = filter.toLowerCase();
    return u.name.toLowerCase().includes(q) || (u.title?.toLowerCase().includes(q) ?? false);
  });

  let visibleUsers: UserRow[];
  let headerLabel: string;
  if (isSearching) {
    visibleUsers = flatFiltered;
    headerLabel = `搜索结果："${filter.trim()}"`;
  } else if (selectedDeptId) {
    const node = findDeptNode(tree, selectedDeptId);
    visibleUsers = node ? collectUsersInSubtree(node) : [];
    headerLabel = node ? deptDisplayName(node) : "未知部门";
  } else {
    visibleUsers = users;
    headerLabel = "全部用户";
  }

  // Stats（基于全量用户，按 module 视角）
  const stats = {
    total: users.length,
    fullyOpened: users.filter((u) => u.opened_count === u.total_count).length,
    partial: users.filter((u) => u.opened_count > 0 && u.opened_count < u.total_count).length,
    closed: users.filter((u) => u.opened_count === 0).length,
  };

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
      {/* 左侧：部门树 */}
      <div className="space-y-2">
        <Input
          placeholder="搜索姓名/岗位..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {!isSearching && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={expandAll}>
              全部展开
            </Button>
            <Button size="sm" variant="outline" onClick={collapseAll}>
              全部折叠
            </Button>
          </div>
        )}
        <div className="bg-card max-h-[720px] overflow-auto rounded-lg border">
          {isSearching ? (
            flatFiltered.length === 0 ? (
              <div className="text-muted-foreground p-3 text-sm">无匹配用户</div>
            ) : (
              <div className="divide-y">
                {flatFiltered.map((u) => (
                  <button
                    key={u.user_id}
                    type="button"
                    onClick={() => setEditingUserId(u.user_id)}
                    className="hover:bg-muted/50 w-full p-3 text-left transition-colors"
                  >
                    <div className="font-medium">{u.name}</div>
                    <div className="text-muted-foreground text-xs">
                      {displayPosition(u)} · 已开通 {u.opened_count}/{u.total_count} 板块
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : tree.length === 0 ? (
            <div className="text-muted-foreground p-3 text-sm">无部门数据</div>
          ) : (
            <div className="py-1">
              {tree.map((root) => (
                <DeptTreeNode
                  key={root.dept_id}
                  node={root}
                  depth={0}
                  expanded={expanded}
                  toggle={toggle}
                  selectedDeptId={selectedDeptId}
                  onSelectDept={setSelectedDeptId}
                  onSelectUser={setEditingUserId}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 右侧：stats + 表格 */}
      <div className="space-y-4 min-w-0">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="总用户" value={stats.total} />
          <StatCard label="全板块开通" value={stats.fullyOpened} />
          <StatCard label="部分开通" value={stats.partial} />
          <StatCard label="无任何权限" value={stats.closed} />
        </div>

        <div className="bg-card rounded-lg border">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <div className="text-base font-semibold">{headerLabel}</div>
              <div className="text-muted-foreground text-xs">共 {visibleUsers.length} 人</div>
            </div>
          </div>

          {visibleUsers.length === 0 ? (
            <div className="text-muted-foreground p-8 text-center text-sm">无用户</div>
          ) : (
            <div className="max-h-[640px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>成员</TableHead>
                    {MODULE_KEYS.map((m) => (
                      <TableHead key={m} className="text-center">
                        {MODULE_LABEL[m]}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleUsers.map((u) => (
                    <TableRow key={u.user_id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar name={u.name} />
                          <div>
                            <div className="text-sm font-medium inline-flex items-center gap-1">
                              {u.name}
                              {u.is_dept_leader && (
                                <Crown
                                  className="h-3.5 w-3.5 text-amber-500"
                                  aria-label="部门负责人"
                                />
                              )}
                            </div>
                            <div className="text-muted-foreground text-xs">
                              {displayPosition(u)}
                              {u.assigned_position && (
                                <span className="ml-1 text-rose-600">·已分配</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      {MODULE_KEYS.map((m) => (
                        <TableCell key={m} className="text-center">
                          <ScopeCell scope={u.module_scopes?.[m] ?? "none"} />
                        </TableCell>
                      ))}
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingUserId(u.user_id)}
                        >
                          配置权限
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* 编辑抽屉 */}
      <Sheet open={editingUserId !== null} onOpenChange={(o) => !o && setEditingUserId(null)}>
        <SheetContent
          side="right"
          className="!w-[760px] !max-w-[760px] sm:!max-w-[760px] p-0"
          showCloseButton={false}
        >
          {editingUserId && (
            <UserDetailPanel userId={editingUserId} onClose={() => setEditingUserId(null)} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
