"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 部门 + 员工树形多选 picker。
 *
 * - 勾部门 = 自动勾下面所有员工（包含子部门）
 * - 取消部门 = 自动取消下面所有员工
 * - 也可单独勾个员工
 * - 顶部搜索框过滤树（按员工姓名 / userid / 岗位 / 部门名）
 * - 显示已选 chips（可点 × 移除）
 *
 * 外部传 selectedUserIds + onChange，组件无状态保存。
 */

export interface PickerUser {
  user_id: string;
  name: string;
  title: string | null;
  dept_ids: string[];
}

export interface PickerDept {
  dept_id: string;
  name: string;
  parent_id: string | null;
}

interface Props {
  selectedUserIds: string[];
  onChange: (next: string[]) => void;
  /** 排除的 user_id（如自己 / ext_ 前缀），不在树里出现 */
  excludeUserIds?: string[];
  placeholder?: string;
}

interface TreeNode {
  dept_id: string;
  name: string;
  parent_id: string | null;
  children: TreeNode[];
  users: PickerUser[];
  /** 含子部门递归后的所有 user_id（用于"勾整组" + 计数） */
  allUserIds: string[];
}

function buildTree(depts: PickerDept[], users: PickerUser[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  for (const d of depts) {
    map.set(d.dept_id, {
      dept_id: d.dept_id,
      name: d.name,
      parent_id: d.parent_id,
      children: [],
      users: [],
      allUserIds: [],
    });
  }
  // 用户挂到第一个匹配的 dept
  for (const u of users) {
    const matched = u.dept_ids.find((id) => map.has(id));
    if (matched) map.get(matched)?.users.push(u);
  }

  const roots: TreeNode[] = [];
  for (const node of map.values()) {
    const parent = node.parent_id ? map.get(node.parent_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  // 递归算 allUserIds
  function computeAll(n: TreeNode): string[] {
    const ids = n.users.map((u) => u.user_id);
    for (const c of n.children) ids.push(...computeAll(c));
    n.allUserIds = ids;
    return ids;
  }
  function sortNode(n: TreeNode) {
    n.children.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    n.users.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    n.children.forEach(sortNode);
  }
  roots.forEach((r) => {
    computeAll(r);
    sortNode(r);
  });
  // 隐藏空节点（无 user 且无 children 有 user 的）
  function isEmpty(n: TreeNode): boolean {
    return n.allUserIds.length === 0;
  }
  function prune(nodes: TreeNode[]): TreeNode[] {
    return nodes.filter((n) => !isEmpty(n)).map((n) => ({ ...n, children: prune(n.children) }));
  }
  return prune(roots).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

function filterTree(nodes: TreeNode[], q: string): TreeNode[] {
  if (!q) return nodes;
  const lower = q.toLowerCase();
  function rec(n: TreeNode): TreeNode | null {
    const userHits = n.users.filter(
      (u) =>
        u.name.toLowerCase().includes(lower) ||
        u.user_id.toLowerCase().includes(lower) ||
        (u.title ?? "").toLowerCase().includes(lower),
    );
    const childHits = n.children.map(rec).filter((c): c is TreeNode => c !== null);
    const deptHit = n.name.toLowerCase().includes(lower);
    if (deptHit) {
      // 部门名命中 → 保留整个子树
      return n;
    }
    if (userHits.length === 0 && childHits.length === 0) return null;
    return { ...n, users: userHits, children: childHits };
  }
  return nodes.map(rec).filter((c): c is TreeNode => c !== null);
}

interface NodeProps {
  node: TreeNode;
  depth: number;
  selected: Set<string>;
  onToggleUser: (userId: string) => void;
  onToggleDept: (userIds: string[], allSelected: boolean) => void;
  expanded: Set<string>;
  onToggleExpand: (deptId: string) => void;
}

function TreeNodeRow({
  node,
  depth,
  selected,
  onToggleUser,
  onToggleDept,
  expanded,
  onToggleExpand,
}: NodeProps) {
  const isOpen = expanded.has(node.dept_id);
  const allSelected = node.allUserIds.length > 0 && node.allUserIds.every((id) => selected.has(id));
  const someSelected = !allSelected && node.allUserIds.some((id) => selected.has(id));
  const selectedCount = node.allUserIds.filter((id) => selected.has(id)).length;

  return (
    <div>
      <div
        className="hover:bg-accent flex items-center gap-1.5 px-1.5 py-1 text-xs"
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
      >
        <button
          type="button"
          onClick={() => onToggleExpand(node.dept_id)}
          className="text-muted-foreground flex h-4 w-4 shrink-0 items-center justify-center"
        >
          {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = someSelected;
          }}
          onChange={() => onToggleDept(node.allUserIds, allSelected)}
          className="h-3.5 w-3.5 shrink-0"
        />
        <span className="flex-1 truncate font-medium">{node.name}</span>
        <span className="text-muted-foreground text-[10px] tabular-nums">
          {selectedCount > 0 ? `${selectedCount}/` : ""}
          {node.allUserIds.length}
        </span>
      </div>
      {isOpen && (
        <>
          {node.users.map((u) => {
            const checked = selected.has(u.user_id);
            return (
              <label
                key={u.user_id}
                className="hover:bg-accent flex cursor-pointer items-center gap-1.5 px-1.5 py-1 text-xs"
                style={{ paddingLeft: `${depth * 14 + 32}px` }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleUser(u.user_id)}
                  className="h-3.5 w-3.5 shrink-0"
                />
                <span className="truncate">{u.name}</span>
                {u.title && (
                  <span className="text-muted-foreground ml-1 truncate text-[10px]">
                    · {u.title}
                  </span>
                )}
              </label>
            );
          })}
          {node.children.map((c) => (
            <TreeNodeRow
              key={c.dept_id}
              node={c}
              depth={depth + 1}
              selected={selected}
              onToggleUser={onToggleUser}
              onToggleDept={onToggleDept}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </>
      )}
    </div>
  );
}

export function UserDeptTreePicker({
  selectedUserIds,
  onChange,
  excludeUserIds = [],
  placeholder = "搜索部门 / 员工姓名 / userid / 岗位",
}: Props) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [allUsers, setAllUsers] = useState<PickerUser[]>([]);
  const [allDepts, setAllDepts] = useState<PickerDept[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/users").then((r) => r.json() as Promise<{ users: PickerUser[] }>),
      fetch("/api/admin/depts").then((r) => r.json() as Promise<{ depts: PickerDept[] }>),
    ])
      .then(([u, d]) => {
        setAllUsers(u.users);
        setAllDepts(d.depts);
      })
      .catch(() => undefined);
  }, []);

  const excludeSet = useMemo(() => new Set(excludeUserIds), [excludeUserIds]);
  const filteredUsers = useMemo(
    () => allUsers.filter((u) => !excludeSet.has(u.user_id) && !u.user_id.startsWith("ext_")),
    [allUsers, excludeSet],
  );

  const tree = useMemo(() => buildTree(allDepts, filteredUsers), [allDepts, filteredUsers]);
  const visibleTree = useMemo(() => filterTree(tree, search.trim()), [tree, search]);

  // 搜索时自动展开命中节点
  useEffect(() => {
    if (!search.trim()) return;
    const expand = new Set(expanded);
    function walk(n: TreeNode) {
      expand.add(n.dept_id);
      n.children.forEach(walk);
    }
    visibleTree.forEach(walk);
    setExpanded(expand);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // 默认初次展开顶层节点
  useEffect(() => {
    if (expanded.size === 0 && tree.length > 0) {
      setExpanded(new Set(tree.map((r) => r.dept_id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree.length]);

  const selected = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);
  const userById = useMemo(() => new Map(allUsers.map((u) => [u.user_id, u])), [allUsers]);

  function toggleUser(userId: string) {
    const next = new Set(selected);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    onChange([...next]);
  }

  function toggleDept(userIds: string[], allSelected: boolean) {
    const next = new Set(selected);
    if (allSelected) {
      userIds.forEach((id) => next.delete(id));
    } else {
      userIds.forEach((id) => next.add(id));
    }
    onChange([...next]);
  }

  function toggleExpand(deptId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(deptId)) next.delete(deptId);
      else next.add(deptId);
      return next;
    });
  }

  function clearAll() {
    onChange([]);
  }

  return (
    <div className="space-y-2">
      {/* 已选 chips */}
      {selectedUserIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedUserIds.map((id) => {
            const u = userById.get(id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-700"
              >
                {u?.name ?? id.slice(0, 8)}
                <button
                  type="button"
                  onClick={() => toggleUser(id)}
                  className="text-sky-500 hover:text-sky-700"
                  aria-label={`移除 ${u?.name ?? id}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
          <button
            type="button"
            onClick={clearAll}
            className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
          >
            清空
          </button>
        </div>
      )}

      {/* 搜索 */}
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={placeholder}
          className="h-8 pl-8 text-xs"
        />
      </div>

      {/* 树 */}
      <div className="max-h-72 overflow-y-auto rounded-md border bg-white">
        {visibleTree.length === 0 ? (
          <div className="text-muted-foreground py-4 text-center text-xs">
            {search ? "没找到匹配的员工" : "加载中…"}
          </div>
        ) : (
          visibleTree.map((n) => (
            <TreeNodeRow
              key={n.dept_id}
              node={n}
              depth={0}
              selected={selected}
              onToggleUser={toggleUser}
              onToggleDept={toggleDept}
              expanded={expanded}
              onToggleExpand={toggleExpand}
            />
          ))
        )}
      </div>

      {/* footer hint */}
      <Label className="text-muted-foreground text-[11px] font-normal">
        勾「部门」= 选中该部门所有成员（含子部门）；勾员工 = 单独添加
      </Label>
    </div>
  );
}
