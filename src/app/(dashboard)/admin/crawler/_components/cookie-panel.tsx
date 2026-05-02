"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface CookieRow {
  basecamp: string;
  status: string;
  captured_at: string;
  expires_at: string | null;
  last_check_at: string | null;
}

export function CookiePanel(): React.JSX.Element {
  const [rows, setRows] = useState<CookieRow[]>([]);

  useEffect(() => {
    fetch("/api/admin/crawler/cookie")
      .then((r) => r.json() as Promise<{ cookies: CookieRow[] }>)
      .then((d) => setRows(d.cookies));
  }, []);

  return (
    <div className="bg-card rounded-lg border p-4">
      <h3 className="font-semibold mb-2">Cookie 状态</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">尚未配置任何 Cookie</p>
      ) : (
        <ul className="text-sm space-y-2">
          {rows.map((r) => (
            <li key={r.basecamp} className="flex items-center justify-between">
              <span>
                <code>{r.basecamp}</code> — 状态:{" "}
                <span className={r.status === "active" ? "text-green-600" : "text-red-600"}>
                  {r.status}
                </span>
              </span>
              {r.status === "expired" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => alert("扫码续期 UI 后续 Phase 实现，先用 admin SQL 写入新 cookie")}
                >
                  扫码续期
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
