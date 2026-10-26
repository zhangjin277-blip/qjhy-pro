"use client";

import { useState } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { Goal, GoalList } from "@/modules/goals";
import type { GoalGroup } from "@/modules/goals/presentation";
import { GoalCompositeProgress } from "./goal-composite-progress";
import styles from "./goals.module.css";

export function GoalOperatorsSummary({
  title,
  groups,
  people,
  access,
  onGroupOpen,
}: {
  title: string;
  groups: GoalGroup[];
  people: (goal: Goal) => string;
  access?: GoalList["access"];
  onGroupOpen?: (mode: "edit" | "close", goals: Goal[]) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!groups.length) return null;
  function manage(mode: "edit" | "close", goals: Goal[]) {
    setOpen(false);
    onGroupOpen?.(mode, goals);
  }
  return (
    <>
      <button className={styles.link} onClick={() => setOpen(true)}>
        运营汇总
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={styles.operatorSummaryDialog}>
          <DialogTitle>{title} · 运营汇总</DialogTitle>
          <DialogDescription>
            各运营的综合达成率按个人指标权重计算，单项最多计100%。这里展示当前筛选范围内的个人目标；各项指标明细可在主列表展开查看。
          </DialogDescription>
          <div className={styles.tableWrap}>
            <table className={`${styles.table} ${styles.operatorSummaryTable}`}>
              <thead>
                <tr>
                  <th>运营</th>
                  <th>指标</th>
                  <th>综合达成率</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => {
                  const first = group.items[0];
                  if (!first) return null;
                  return (
                    <tr key={group.key}>
                      <td>
                        <strong>{people(first)}</strong>
                      </td>
                      <td>
                        {group.current.length}项当前指标
                        <div className={styles.muted}>
                          {group.current.map((g) => g.metric).join("、")}
                        </div>
                        {!!group.archived && (
                          <div className={styles.muted}>{group.archived}项已归档</div>
                        )}
                      </td>
                      <td>
                        {group.current.length ? (
                          <GoalCompositeProgress items={group.current} compact />
                        ) : (
                          <span className={styles.muted}>已归档</span>
                        )}
                      </td>
                      <td>
                        <div className={styles.actions}>
                          {onGroupOpen ? (
                            <>
                              {!!group.current.length &&
                                group.current.every((g) =>
                                  g.status === "draft" ? access?.fill : access?.publish,
                                ) && (
                                  <button
                                    className={styles.link}
                                    onClick={() => manage("edit", group.current)}
                                  >
                                    调整
                                  </button>
                                )}
                              {access?.publish &&
                                group.current.some((g) => g.status === "published") && (
                                  <button
                                    className={styles.link}
                                    onClick={() => manage("close", group.current)}
                                  >
                                    归档
                                  </button>
                                )}
                            </>
                          ) : (
                            <Link className={styles.link} href="/goals">
                              目标管理
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
