"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserDetailPanel } from "./user-detail";
import type { Scope } from "@/modules/permissions";

interface UserRow {
  user_id: string;
  name: string;
  title: string | null;
  dept_ids: string[];
  dept_id: string | null;
  scope: Scope;
}

interface DeptRow {
  dept_id: string;
  name: string;
  parent_id: string | null;
}

interface DeptNode {
  dept_id: string;
  name: string;
  parent_id: string | null;
  children: DeptNode[];
  users: UserRow[];
  totalUsers: number;
}

const ROOT_PARENT_ID = "1"; // 钉钉根部门

function buildDeptTree(depts: DeptRow[], users: UserRow[]): DeptNode[] {
  const nodeMap = new Map<string, DeptNode>();
  for (const d of depts) {
    nodeMap.set(d.dept_id, {
      dept_id: d.dept_id,
      name: d.name,
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

  // 部门按名字排序
  function sortNode(n: DeptNode) {
    n.children.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    n.users.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    n.children.forEach(sortNode);
  }
  roots.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  roots.forEach(sortNode);

  return roots;
}

interface DeptTreeNodeProps {
  node: DeptNode;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  selected: string | null;
  setSelected: (id: string) => void;
}

function DeptTreeNode({ node, depth, expanded, toggle, selected, setSelected }: DeptTreeNodeProps) {
  const isOpen = expanded.has(node.dept_id);
  const hasContent = node.children.length > 0 || node.users.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => toggle(node.dept_id)}
        className="hover:bg-muted/50 flex w-full items-center gap-1 px-2 py-1.5 text-left text-sm transition-colors"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {hasContent ? (
          isOpen ? (
            <ChevronDown className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <span className="font-medium">{node.name}</span>
        <span className="text-muted-foreground ml-1 text-xs">({node.totalUsers})</span>
      </button>
      {isOpen && (
        <div>
          {node.children.map((child) => (
            <DeptTreeNode
              key={child.dept_id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              selected={selected}
              setSelected={setSelected}
            />
          ))}
          {node.users.map((u) => (
            <button
              key={u.user_id}
              type="button"
              onClick={() => setSelected(u.user_id)}
              className={`hover:bg-muted/50 flex w-full flex-col items-start px-2 py-1.5 text-left transition-colors ${
                selected === u.user_id ? "bg-accent" : ""
              }`}
              style={{ paddingLeft: `${(depth + 1) * 12 + 16}px` }}
            >
              <span className="text-sm font-medium">{u.name}</span>
              <span className="text-muted-foreground text-xs">
                {u.title ?? "未填岗位"} · scope=
                <span className="font-mono">{u.scope}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function UsersTab() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [depts, setDepts] = useState<DeptRow[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
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
        const first = u.users[0];
        if (first) {
          setSelected((prev) => prev ?? first.user_id);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const tree = useMemo(() => buildDeptTree(depts, users), [depts, users]);

  // 默认展开第一层（即 roots）
  useEffect(() => {
    if (tree.length > 0 && expanded.size === 0) {
      setExpanded(new Set(tree.map((r) => r.dept_id)));
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

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
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
        <div className="bg-card max-h-[640px] overflow-auto rounded-lg border">
          {isSearching ? (
            flatFiltered.length === 0 ? (
              <div className="text-muted-foreground p-3 text-sm">无匹配用户</div>
            ) : (
              <div className="divide-y">
                {flatFiltered.map((u) => (
                  <button
                    key={u.user_id}
                    type="button"
                    onClick={() => setSelected(u.user_id)}
                    className={`hover:bg-muted/50 w-full p-3 text-left transition-colors ${
                      selected === u.user_id ? "bg-accent" : ""
                    }`}
                  >
                    <div className="font-medium">{u.name}</div>
                    <div className="text-muted-foreground text-xs">
                      {u.title ?? "未填岗位"} · scope=
                      <span className="font-mono">{u.scope}</span>
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
                  selected={selected}
                  setSelected={setSelected}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="bg-card rounded-lg border p-4">
        {selected ? (
          <UserDetailPanel userId={selected} />
        ) : (
          <p className="text-muted-foreground">选择左侧用户查看详情</p>
        )}
      </div>
    </div>
  );
}
