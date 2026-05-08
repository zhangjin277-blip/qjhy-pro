"use client";

import { useEffect, useState } from "react";
import { PresetChip, PresetToolbar } from "@/components/patterns/preset-toolbar";
import { AnchorTable } from "./anchor-table";
import { KuaishouAnchorTable } from "./kuaishou-anchor-table";

type Platform = "douyin" | "kuaishou";
const STORAGE_KEY = "qjhy.anchors.platform";

function readInitialPlatform(): Platform {
  if (typeof window === "undefined") return "douyin";
  const url = new URL(window.location.href);
  const p = url.searchParams.get("platform");
  if (p === "kuaishou" || p === "douyin") return p;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "kuaishou" || saved === "douyin") return saved;
  return "douyin";
}

export function AnchorsBoard(): React.JSX.Element {
  // SSR 一致性：先用默认值，挂载后再读 localStorage / URL
  const [platform, setPlatform] = useState<Platform>("douyin");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPlatform(readInitialPlatform());
    setHydrated(true);
  }, []);

  function changePlatform(next: Platform): void {
    setPlatform(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    const url = new URL(window.location.href);
    url.searchParams.set("platform", next);
    window.history.replaceState(null, "", url.toString());
  }

  return (
    <div className="space-y-3">
      <PresetToolbar label="平台:">
        <PresetChip active={platform === "douyin"} onClick={() => changePlatform("douyin")}>
          抖音
        </PresetChip>
        <PresetChip active={platform === "kuaishou"} onClick={() => changePlatform("kuaishou")}>
          快手
        </PresetChip>
      </PresetToolbar>
      {/* 挂载前不渲染 table 避免 hydration mismatch（platform 用户偏好需要客户端读取） */}
      {hydrated && (platform === "douyin" ? <AnchorTable /> : <KuaishouAnchorTable />)}
    </div>
  );
}
