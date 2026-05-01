"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { UserDetailPanel } from "./user-detail";
import type { Scope } from "@/modules/permissions";

interface UserRow {
  user_id: string;
  name: string;
  title: string | null;
  dept_ids: string[];
  scope: Scope;
}

export function UsersTab() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data: { users: UserRow[] }) => {
        setUsers(data.users);
        const first = data.users[0];
        if (first) {
          setSelected((prev) => prev ?? first.user_id);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-4 text-muted-foreground">加载中...</div>;

  const filtered = users.filter((u) => {
    const q = filter.toLowerCase();
    return u.name.toLowerCase().includes(q) || (u.title?.toLowerCase().includes(q) ?? false);
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 mt-4">
      <div className="space-y-2">
        <Input
          placeholder="搜索姓名/岗位..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="border rounded-lg divide-y max-h-[600px] overflow-auto bg-card">
          {filtered.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">无匹配用户</div>
          ) : (
            filtered.map((u) => (
              <button
                key={u.user_id}
                type="button"
                onClick={() => setSelected(u.user_id)}
                className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${
                  selected === u.user_id ? "bg-accent" : ""
                }`}
              >
                <div className="font-medium">{u.name}</div>
                <div className="text-xs text-muted-foreground">
                  {u.title ?? "未填岗位"} · scope=<span className="font-mono">{u.scope}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
      <div className="border rounded-lg p-4 bg-card">
        {selected ? (
          <UserDetailPanel userId={selected} />
        ) : (
          <p className="text-muted-foreground">选择左侧用户查看详情</p>
        )}
      </div>
    </div>
  );
}
