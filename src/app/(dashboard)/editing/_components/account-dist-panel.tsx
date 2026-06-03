"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

interface AccountDistPanelProps {
  /** 当前范围内有剪辑任务的直播账号（按产品聚合，点击筛选看板） */
  accounts: { id: string; name: string; product: string }[];
}

export function AccountDistPanel({ accounts }: AccountDistPanelProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);

  const selected = sp.get("accounts")?.split(",").filter(Boolean) ?? [];

  // 按产品分组
  const groups = (() => {
    const m = new Map<string, typeof accounts>();
    for (const a of accounts) {
      const arr = m.get(a.product);
      if (arr) arr.push(a);
      else m.set(a.product, [a]);
    }
    return Array.from(m.entries()).map(([product, items]) => ({ product, items }));
  })();

  function setAccounts(next: string[]) {
    const params = new URLSearchParams(sp.toString());
    if (next.length === 0) params.delete("accounts");
    else params.set("accounts", next.join(","));
    router.push(`?${params.toString()}`);
  }

  function toggle(id: string) {
    setAccounts(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  if (accounts.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold text-slate-700">直播账号</h3>
          <span className="text-[11px] text-muted-foreground">
            点击账号筛选任务{selected.length > 0 ? ` · 已选 ${selected.length}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          {selected.length > 0 && (
            <button
              onClick={() => setAccounts([])}
              className="text-[11px] text-muted-foreground hover:text-blue-600"
            >
              清空
            </button>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-[11px] text-blue-600 hover:underline"
          >
            {collapsed ? "展开" : "收起"}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="space-y-2">
          {groups.map((g) => (
            <div key={g.product} className="flex gap-3">
              <div className="w-[92px] shrink-0 pt-1 text-[12px] font-semibold text-slate-600">
                {g.product}
              </div>
              <div className="flex flex-1 flex-wrap gap-1.5">
                {g.items.map((a) => {
                  const on = selected.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggle(a.id)}
                      className={`rounded-md border px-2.5 py-1 text-[12px] transition ${
                        on
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-300 hover:bg-blue-50/40"
                      }`}
                    >
                      {a.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
