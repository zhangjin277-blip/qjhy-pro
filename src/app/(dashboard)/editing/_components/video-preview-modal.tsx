"use client";
import { useEffect, useRef } from "react";

interface Props {
  src: string;
  fileName: string;
  onClose: () => void;
  /** 关闭时回传本次累计观看秒数（基于 play 事件 + currentTime 增量） */
  onWatched?: (seconds: number) => void;
}

export function VideoPreviewModal({ src, fileName, onClose, onWatched }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // 本次 play 起点 video.currentTime 和累计秒数
  const lastPlayPosition = useRef<number | null>(null);
  const accumulatedSeconds = useRef(0);

  function flushPlaySegment() {
    const v = videoRef.current;
    if (v && lastPlayPosition.current !== null) {
      const delta = Math.max(0, v.currentTime - lastPlayPosition.current);
      accumulatedSeconds.current += Math.floor(delta);
      lastPlayPosition.current = null;
    }
  }

  function reportAndClose() {
    flushPlaySegment();
    if (onWatched && accumulatedSeconds.current > 0) {
      onWatched(accumulatedSeconds.current);
    }
    onClose();
  }

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") reportAndClose();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80"
      onClick={reportAndClose}
    >
      <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={reportAndClose}
          className="absolute -top-10 right-0 text-2xl text-white hover:text-slate-300"
          aria-label="关闭"
        >
          ✕
        </button>
        <div className="mb-2 text-sm text-white/80">{fileName}</div>
        <video
          ref={videoRef}
          src={src}
          controls
          autoPlay
          onPlay={(e) => {
            lastPlayPosition.current = e.currentTarget.currentTime;
          }}
          onPause={flushPlaySegment}
          onSeeking={flushPlaySegment}
          onEnded={flushPlaySegment}
          className="max-h-[80vh] max-w-[90vw] rounded shadow-2xl"
        />
      </div>
    </div>
  );
}
