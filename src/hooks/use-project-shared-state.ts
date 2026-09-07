"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectSharedStateResponse } from "@/modules/project-shared-state";

interface SharedStateStatus {
  ready: boolean;
  saving: boolean;
  error: string | null;
  updatedAt: string | null;
}

function readLocal<T>(key: string | undefined): T | undefined {
  if (!key) return undefined;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function writeLocal<T>(key: string | undefined, value: T): void {
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Browser storage is only a cache; server persistence remains authoritative.
  }
}

export function useProjectSharedState<T>(options: {
  projectKey: string;
  stateKey: string;
  initialValue: T;
  localStorageKey?: string;
  pollMs?: number;
}) {
  const { projectKey, stateKey, initialValue, localStorageKey, pollMs = 10_000 } = options;
  const url = `/api/projects/${projectKey}/shared-state/${stateKey}`;
  const [value, setValue] = useState<T>(initialValue);
  const [status, setStatus] = useState<SharedStateStatus>({
    ready: false,
    saving: false,
    error: null,
    updatedAt: null,
  });
  const valueRef = useRef(value);
  const initialValueRef = useRef(initialValue);
  const revisionRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  valueRef.current = value;

  const accept = useCallback(
    (response: ProjectSharedStateResponse<T>) => {
      const changed = revisionRef.current !== response.revision;
      revisionRef.current = response.revision;
      if (changed) {
        valueRef.current = response.payload;
        setValue(response.payload);
        writeLocal(localStorageKey, response.payload);
      }
      setStatus({ ready: true, saving: false, error: null, updatedAt: response.updatedAt });
    },
    [localStorageKey],
  );

  const load = useCallback(
    async (bootstrap: boolean) => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (response.ok) {
          accept((await response.json()) as ProjectSharedStateResponse<T>);
          return;
        }
        if (response.status !== 404 || !bootstrap) throw new Error("共享数据加载失败");
        const seed = readLocal<T>(localStorageKey) ?? initialValueRef.current;
        const created = await fetch(url, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ payload: seed, revision: null }),
        });
        if (created.ok) {
          accept((await created.json()) as ProjectSharedStateResponse<T>);
          return;
        }
        if (created.status === 409) {
          const conflict = (await created.json()) as { current: ProjectSharedStateResponse<T> };
          if (conflict.current) accept(conflict.current);
          return;
        }
        throw new Error("共享数据初始化失败");
      } catch (error) {
        setStatus((current) => ({
          ...current,
          ready: true,
          saving: false,
          error: error instanceof Error ? error.message : "共享数据加载失败",
        }));
      }
    },
    [accept, localStorageKey, url],
  );

  useEffect(() => {
    void load(true);
    const timer = window.setInterval(() => {
      if (!savingRef.current && document.visibilityState === "visible") void load(false);
    }, pollMs);
    const refresh = () => {
      if (!savingRef.current) void load(false);
    };
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [load, pollMs]);

  const update = useCallback(
    async (updater: (current: T) => T): Promise<boolean> => {
      if (savingRef.current || revisionRef.current === null) return false;
      const previous = valueRef.current;
      const next = updater(previous);
      setValue(next);
      savingRef.current = true;
      setStatus((current) => ({ ...current, saving: true, error: null }));

      const put = async (payload: T, revision: number) =>
        fetch(url, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ payload, revision }),
        });
      try {
        let response = await put(next, revisionRef.current);
        if (response.status === 409) {
          const conflict = (await response.json()) as { current: ProjectSharedStateResponse<T> };
          if (!conflict.current) throw new Error("共享数据版本冲突");
          const rebased = updater(conflict.current.payload);
          response = await put(rebased, conflict.current.revision);
        }
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "保存失败，请稍后重试");
        }
        accept((await response.json()) as ProjectSharedStateResponse<T>);
        return true;
      } catch (error) {
        setValue(previous);
        valueRef.current = previous;
        setStatus((current) => ({
          ...current,
          saving: false,
          error: error instanceof Error ? error.message : "保存失败，请稍后重试",
        }));
        return false;
      } finally {
        savingRef.current = false;
      }
    },
    [accept, url],
  );

  return { value, update, ...status, refresh: () => load(false) };
}
