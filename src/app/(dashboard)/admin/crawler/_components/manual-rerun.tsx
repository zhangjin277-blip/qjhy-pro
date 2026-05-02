"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { rerunCrawl } from "@/modules/crawler";

export function ManualRerun(): React.JSX.Element {
  const [date, setDate] = useState(new Date(Date.now() - 86400_000).toISOString().slice(0, 10));
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
          onClick={async () => {
            await rerunCrawl({ date, basecamp: "cs" });
            alert("已入队");
          }}
        >
          重跑
        </Button>
      </div>
    </div>
  );
}
