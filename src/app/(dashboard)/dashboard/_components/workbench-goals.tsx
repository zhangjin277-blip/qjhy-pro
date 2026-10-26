"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Target } from "lucide-react";
import { businessDate } from "@/lib/business-date";
import { goalProgress, type GoalList, type Goal } from "@/modules/goals";
import styles from "../../goals/goals.module.css";
import { GoalGroupsTable } from "../../goals/goal-groups-table";
import { GoalDetailContent } from "../../goals/goal-detail-content";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function WorkbenchGoals({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<GoalList | null>(null),
    [hidden, setHidden] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = data?.items.find((goal) => goal.id === selectedId) ?? null;
  const month = businessDate().slice(0, 7);
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/goals?period=${month}&home=1`, { cache: "no-store", signal: abort.signal })
      .then(async (r) => {
        if (r.status === 403) {
          setHidden(true);
          return;
        }
        const json = await r.json();
        if (!r.ok) throw new Error(json.error);
        setHidden(false);
        setError("");
        setData(json);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError("目标暂时无法加载");
      });
    return () => abort.abort();
  }, [month, refreshKey, retry]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) setRetry((v) => v + 1);
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  if (hidden) return null;
  const ownerNames = (goal: Goal) =>
    goal.owner_ids
      .map((id) => data?.users.find((u) => u.id === id)?.name ?? "已绑定运营")
      .join("、");
  const attention = data?.items.filter((g) => goalProgress(g).attention).length ?? 0;
  return (
    <section id="workbench-goals" className={styles.panel} aria-label="本月目标跟进">
      <header className={styles.panelHead}>
        <h2>
          <Target />
          本月目标跟进 <span className={styles.muted}>{month}</span>
        </h2>
        <div className={styles.actions}>
          {attention > 0 && <span className={styles.warning}>{attention}项待跟进</span>}
          <Link className={styles.link} href="/goals">
            目标管理 <ChevronRight size={13} style={{ display: "inline" }} />
          </Link>
        </div>
      </header>
      {error ? (
        <div className={styles.empty}>
          {error}
          <button className={styles.link} onClick={() => setRetry((v) => v + 1)}>
            重试
          </button>
        </div>
      ) : !data ? (
        <div className={styles.empty}>正在加载目标…</div>
      ) : !data.items.length ? (
        <div className={styles.empty}>
          本月暂无已发布目标。
          <Link className={styles.link} href="/goals">
            查看目标草稿
          </Link>
        </div>
      ) : (
        <GoalGroupsTable
          items={data.items}
          allItems={data.items}
          access={data.access}
          departments={data.departments}
          people={ownerNames}
          allocation={() => ""}
          onOpen={(_, goal) => setSelectedId(goal.id)}
          readOnly
        />
      )}
      {data && data.items.length > 0 && (
        <div className={styles.footnote}>
          仅展示已发布目标 · 展开项目查看指标，点击指标查看运营达成率 ·
          综合进度按权重汇总，个人数据不重复计入团队
        </div>
      )}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[1060px]">
          <DialogTitle>目标详情</DialogTitle>
          <DialogDescription>
            {selected ? `${selected.period} · ${selected.project} · ${selected.metric}` : ""}
          </DialogDescription>
          {selected && data && (
            <GoalDetailContent
              key={selected.id}
              goal={selected}
              items={data.items}
              departments={data.departments}
              people={ownerNames}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
