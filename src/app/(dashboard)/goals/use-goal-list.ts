"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GoalList } from "@/modules/goals";

export function useGoalList(initial: GoalList, period: string) {
  const [data, setData] = useState(initial);
  const [loadedPeriod, setLoadedPeriod] = useState<string | null>(null);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const reload = useCallback(
    async (signal?: AbortSignal) => {
      const id = ++requestId.current;
      setError("");
      try {
        const query = new URLSearchParams({ "resolve-period": period });
        const response = await fetch(`/api/goals?${query}`, { cache: "no-store", signal });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "目标进度加载失败，请重试");
        if (!signal?.aborted && id === requestId.current) {
          setData(json);
          setLoadedPeriod(period);
        }
      } catch (cause) {
        if (signal?.aborted) return;
        if (id === requestId.current)
          setError(cause instanceof Error ? cause.message : "目标进度加载失败，请重试");
        throw cause;
      }
    },
    [period],
  );

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal).catch(() => {
      /* Error is shown beside the list; keep existing data. */
    });
    const timer = setInterval(() => {
      if (!document.hidden)
        void reload(controller.signal).catch(() => {
          /* Error is shown beside the list; keep existing data. */
        });
    }, 60000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [reload]);

  return { data, reload, error, loading: loadedPeriod !== period, ready: loadedPeriod === period };
}
