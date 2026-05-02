"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserDetailPanel } from "./user-detail";
import type { Scope } from "@/modules/permissions";

interface UserRow {
  user_id: string;
  name: string;
  title: string | null;
  dept_ids: string[];
  dept_id: string | null;
  scope: Scope;
  can_edit: boolean;
  can_export: boolean;
  can_admin: boolean;
  source_kinds: string[];
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

/** 显示名：别名优先，原名兜底 */
function deptDisplayName(node: { name: string; alias: string | null }): string {
  return node.alias ?? node.name;
}

/** Hover tooltip：有别名时显示原名+备注；无别名时显示备注 */
function deptTooltip(node: { name: string; alias: string | null; note: string | null }): string {
  const parts: string[] = [];
  if (node.alias) parts.push(`原名：${node.name}`);
  if (node.note) parts.push(`备注：${node.note}`);
  return parts.join(" · ");
}

const ROOT_PARENT_ID = "1"; // 钉钉根部门

const SCOPE_LABEL: Record<Scope, string> = {
  none: "无权限",
  self: "仅本人",
  team: "本部门",
  all: "全部",
};

const SCOPE_TAG_CLASS: Record<Scope, string> = {
  none: "bg-muted text-muted-foreground",
  self: "bg-sky-100 text-sky-700",
  team: "bg-violet-100 text-violet-700",
  all: "bg-amber-100 text-amber-700",
};

const SOURCE_LABEL: Record<string, string> = {
  default: "岗位默认",
  dept_leader: "部门负责人",
  override: "个体覆盖",
};

const SOURCE_TAG_CLASS: Record<string, string> = {
  default: "bg-muted text-muted-foreground",
  dept_leader: "bg-emerald-100 text-emerald-700",
  override: "bg-rose-100 text-rose-700",
};

function ScopeTag({ scope }: { scope: Scope }) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-medium ${SCOPE_TAG_CLASS[scope]}`}
    >
      {SCOPE_LABEL[scope]}
    </span>
  );
}

function SourceTags({ kinds }: { kinds: string[] }) {
  if (kinds.length === 0) return <span className="text-muted-foreground text-xs">无</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {kinds.map((k) => (
        <span
          key={k}
          className={`inline-flex h-5 items-center rounded px-1.5 text-[11px] font-medium ${
            SOURCE_TAG_CLASS[k] ?? "bg-muted text-muted-foreground"
          }`}
        >
          {SOURCE_LABEL[k] ?? k}
        </span>
      ))}
    </div>
  );
}

function PermDots({ user }: { user: UserRow }) {
  const items: { key: string; on: boolean; label: string }[] = [
    { key: "edit", on: user.can_edit, label: "编辑" },
    { key: "export", on: user.can_export, label: "导出" },
    { key: "admin", on: user.can_admin, label: "管理" },
  ];
  return (
    <div className="flex gap-2 text-xs">
      {items.map((it) => (
        <span
          key={it.key}
          className={
            it.on
              ? "inline-flex items-center gap-1 text-foreground"
              : "inline-flex items-center gap-1 text-muted-foreground/60"
          }
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${it.on ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
          />
          {it.label}
        </span>
      ))}
    </div>
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
      <div className="mt-1 text-2xl font-semibold">{value}</div>
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

  // 用户挂在 dept_ids 数组中"第一个能匹配到部门表"的节点下
  for (const u of users) {
    const matchedDeptId = u.dept_ids.find((id) => nodeMap.has(id));
    if (matchedDeptId) {
      const target = nodeMap.get(matchedDeptId);
      if (target) target.users.push(u);
    }
  }

  // 装配 children 关系
  const roots: DeptNode[] = [];
  for (const node of nodeMap.values()) {
    const parent = node.parent_id ? nodeMap.get(node.parent_id) : undefined;
    if (parent) {
      parent.children.push(node);
    } else if (node.parent_id === ROOT_PARENT_ID || node.parent_id === null) {
      roots.push(node);
    } else {
      // 父部门不在表里（脏数据），当 root 处理
      roots.push(node);
    }
  }

  // 计算每个节点的递归用户数
  function computeTotal(node: DeptNode): number {
    const childTotal = node.children.reduce((sum, c) => sum + computeTotal(c), 0);
    node.totalUsers = node.users.length + childTotal;
    return node.totalUsers;
  }
  roots.forEach(computeTotal);

  // 部门按显示名（别名优先）排序
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
              <span className="text-muted-foreground text-xs">{u.title ?? "未填岗位"}</span>
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

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/users").then((r) => r.json() as Promise<{ users: UserRow[] }>),
      fetch("/api/admin/depts").then((r) => r.json() as Promise<{ depts: DeptRow[] }>),
    ])
      .then(([u, d]) => {
        setUsers(u.users);
        setDepts(d.depts);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const tree = useMemo(() => buildDeptTree(depts, users), [depts, users]);

  // 默认选中第一个 root 部门 + 展开第一层
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

  // 表格里要展示的用户
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

  // Stats（基于全量用户）
  const stats = {
    total: users.length,
    admin: users.filter((u) => u.can_admin).length,
    leader: users.filter((u) => u.source_kinds.includes("dept_leader")).length,
    override: users.filter((u) => u.source_kinds.includes("override")).length,
  };

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
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
                      {u.title ?? "未填岗位"} · 数据范围：{SCOPE_LABEL[u.scope]}
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
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="总用户" value={stats.total} />
          <StatCard label="可管理（admin）" value={stats.admin} />
          <StatCard label="部门负责人" value={stats.leader} />
          <StatCard label="个体覆盖" value={stats.override} />
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
                    <TableHead>数据范围</TableHead>
                    <TableHead>权限标志</TableHead>
                    <TableHead>权限来源</TableHead>
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
                            <div className="text-sm font-medium">{u.name}</div>
                            <div className="text-muted-foreground text-xs">
                              {u.title ?? "未填岗位"}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <ScopeTag scope={u.scope} />
                      </TableCell>
                      <TableCell>
                        <PermDots user={u} />
                      </TableCell>
                      <TableCell>
                        <SourceTags kinds={u.source_kinds} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingUserId(u.user_id)}
                        >
                          权限设置
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

      {/* 编辑弹窗 */}
      <Dialog open={editingUserId !== null} onOpenChange={(o) => !o && setEditingUserId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>权限设置</DialogTitle>
          </DialogHeader>
          {editingUserId && <UserDetailPanel userId={editingUserId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
