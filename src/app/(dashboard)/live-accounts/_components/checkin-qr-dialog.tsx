"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";

interface Props {
  open: boolean;
  onClose: () => void;
  accountId: string;
  label: string;
}

/** 二维码 URL 用 env 配置的稳定域名，避免运营从内网 IP 访问导致 QR 也是内网 IP（外网主播扫不开） */
function getBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return typeof window !== "undefined" ? window.location.origin : "";
}

export function CheckinQrDialog({
  open,
  onClose,
  accountId,
  label,
}: Props): React.JSX.Element | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const url = `${getBaseUrl()}/checkin/${accountId}`;
    QRCode.toDataURL(url, { width: 320, margin: 2, errorCorrectionLevel: "M" })
      .then(setDataUrl)
      .catch(() => setDataUrl(null));
  }, [open, accountId]);

  if (!open || !mounted) return null;

  const checkinUrl = `${getBaseUrl()}/checkin/${accountId}`;

  const dialog = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-[15px] font-semibold text-slate-900">打卡二维码</h3>
            <p className="mt-0.5 text-[12px] text-slate-500 truncate">{label}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-[18px] leading-none"
          >
            ✕
          </button>
        </header>

        <div className="flex flex-col items-center gap-3 py-3">
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dataUrl} alt="QR" className="h-64 w-64" />
          ) : (
            <div className="h-64 w-64 bg-slate-100 animate-pulse rounded" />
          )}
          <div className="break-all px-2 text-center font-mono text-[10.5px] text-slate-400">
            {checkinUrl}
          </div>
        </div>

        <div className="mt-2 space-y-1.5 rounded-md bg-slate-50 px-3 py-2.5 text-[11.5px] text-slate-600 leading-relaxed">
          <div>📱 主播用钉钉扫码即可打卡</div>
          <div>• 没在播 → 点「我要开播」</div>
          <div>• 自己在播 → 点「下播」</div>
          <div>• 别人没下播 → 点「我来接班」自动替前一班关</div>
        </div>

        {dataUrl && (
          <a
            href={dataUrl}
            download={`checkin-qr-${label}.png`}
            className="mt-3 block w-full rounded-md border border-slate-300 py-2 text-center text-[13px] font-medium text-slate-700 hover:bg-slate-50"
          >
            下载二维码 PNG
          </a>
        )}
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
