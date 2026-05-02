"use client";

import { useEffect, useState } from "react";

export function QueueStatus(): React.JSX.Element {
  const [stats, setStats] = useState<Record<string, { created: number }> | null>(null);

  useEffect(() => {
    fetch("/api/admin/crawler/status")
      .then((r) => r.json() as Promise<{ stats: Record<string, { created: number }> }>)
      .then((d) => setStats(d.stats));
  }, []);

  if (!stats) return <div className="text-sm text-muted-foreground">加载中...</div>;

  return (
    <div className="bg-card rounded-lg border p-4">
      <h3 className="font-semibold mb-2">队列状态</h3>
      <ul className="text-sm space-y-1">
        {Object.entries(stats).map(([name, v]) => (
          <li key={name}>
            <code className="text-xs">{name}</code> — 排队 {v.created}
          </li>
        ))}
      </ul>
    </div>
  );
}
