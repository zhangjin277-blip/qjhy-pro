"use client";
import { useState } from "react";
import { markPublished } from "@/modules/editing-task";
import { toast } from "sonner";

interface Props {
  taskId: number;
  isAdmin?: boolean; // 已不再用于发布跳过（保留兼容调用方）
  onDone?: () => void;
}

export function MarkPublishedDialog({ taskId, onDone }: Props) {
  const [step, setStep] = useState<"idle" | "need_video">("idle");
  const [videoId, setVideoId] = useState("");

  const attempt = async (videoIdInput: string | null | undefined) => {
    try {
      const r = await markPublished({ taskId, videoId: videoIdInput });
      if (r.ok) {
        toast.success(r.autoMatched ? "已自动绑定抖音视频" : "已发布");
        onDone?.();
        location.reload();
      } else {
        setStep("need_video");
        toast.warning("未匹配到抖音视频，可手填 ID 或直接发布");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "发布失败");
    }
  };

  if (step === "idle") {
    return (
      <button
        onClick={() => attempt(undefined)}
        className="rounded bg-blue-500 px-3 py-1.5 text-sm text-white hover:bg-blue-600"
      >
        标记已发布
      </button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <input
        value={videoId}
        onChange={(e) => setVideoId(e.target.value)}
        placeholder="抖音视频 ID（aweme_id，可选）"
        className="rounded border border-border px-2 py-1 text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <button
          disabled={!videoId.trim()}
          onClick={() => attempt(videoId.trim())}
          className="rounded bg-blue-500 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          填 ID 绑定
        </button>
        <button
          onClick={() => attempt(null)}
          className="rounded bg-green-500 px-3 py-1.5 text-sm text-white hover:bg-green-600"
        >
          直接发布（不绑定）
        </button>
        <button onClick={() => setStep("idle")} className="text-sm text-slate-500">
          取消
        </button>
      </div>
    </div>
  );
}
