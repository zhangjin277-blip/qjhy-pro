"use client";

import { useEffect, useState } from "react";
import type { GoalBinding } from "@/modules/goals";

interface SourceOptions {
  accounts: { id: string; name: string; operator_ids?: string[]; products?: string[] }[];
  users: { id: string; name: string }[];
  allowAll: boolean;
  unassignedAccounts: number;
  unassignedOperators?: number;
}
export interface SourceOptionsState {
  status: "idle" | "loading" | "ready" | "error";
  data: SourceOptions | null;
  error: string;
}

/** One request supplies both pickers; a changed context never exposes the old candidates. */
export function useSourceOptions(
  binding: GoalBinding | null | undefined,
  departmentId: string | null,
) {
  const key = binding ? JSON.stringify([binding.source, binding.product, departmentId]) : "";
  const [result, setResult] = useState<SourceOptionsState & { key: string }>({
    key: "",
    status: "idle",
    data: null,
    error: "",
  });
  useEffect(() => {
    if (!key) return;
    const [source, product, dept] = JSON.parse(key) as [string, string, string | null];
    const query = new URLSearchParams({ source, product });
    if (dept) query.set("dept", dept);
    const controller = new AbortController();
    fetch(`/api/goals?${query}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "读取人员和账号失败");
        if (!controller.signal.aborted) setResult({ key, status: "ready", data: json, error: "" });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setResult({
            key,
            status: "error",
            data: null,
            error: error instanceof Error ? error.message : "读取人员和账号失败",
          });
      });
    return () => controller.abort();
  }, [key]);
  if (!key) return { status: "idle", data: null, error: "" } as const;
  if (result.key !== key) return { status: "loading", data: null, error: "" } as const;
  return result;
}
