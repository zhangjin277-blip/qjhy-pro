"use client";
import { useEffect } from "react";

interface Props {
  src: string;
  fileName: string;
  onClose: () => void;
}

export function VideoPreviewModal({ src, fileName, onClose }: Props) {
  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-2xl text-white hover:text-slate-300"
          aria-label="关闭"
        >
          ✕
        </button>
        <div className="mb-2 text-sm text-white/80">{fileName}</div>
        <video
          src={src}
          controls
          autoPlay
          className="max-h-[80vh] max-w-[90vw] rounded shadow-2xl"
        />
      </div>
    </div>
  );
}
