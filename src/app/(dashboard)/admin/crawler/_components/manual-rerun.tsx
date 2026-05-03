"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { rerunCrawl } from "@/modules/crawler";

export function ManualRerun(): React.JSX.Element {
  const [date, setDate] = useState(new Date(Date.now() - 86400_000).toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  return (
    <div className="bg-card rounded-lg border p-4 space-y-2">
      <h3 className="font-semibold">手动重跑</h3>
      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="max-w-[160px]"
        />
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            try {
              await rerunCrawl({ date, basecamp: "cs" });
              setMsg({ kind: "ok", text: `已入队 ${date}（cs）` });
            } catch (e) {
              setMsg({ kind: "err", text: `失败: ${(e as Error).message}` });
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "入队中..." : "重跑"}
        </Button>
      </div>
      {msg && (
        <div
          className={
            msg.kind === "ok"
              ? "text-change-down text-sm"
              : "text-change-up text-sm whitespace-pre-wrap"
          }
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}
