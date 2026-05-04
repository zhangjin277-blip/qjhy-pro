"use client";

/**
 * 简易 SVG sparkline，无依赖。
 *
 * - 数据全 0 或长度 < 2 → 画一条平直中线
 * - 默认尺寸 96 x 28，颜色 #1664FF
 * - viewBox 自适应，外部用 className 控制大小
 */
export function Sparkline({
  data,
  width = 96,
  height = 28,
  stroke = "#1664FF",
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  className?: string;
}): React.JSX.Element {
  const pad = 2;
  const w = width;
  const h = height;

  const flatLine = (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className={className} aria-hidden="true">
      <line
        x1={pad}
        y1={h / 2}
        x2={w - pad}
        y2={h / 2}
        stroke="#e5e6eb"
        strokeWidth="1"
        strokeDasharray="2,3"
      />
    </svg>
  );

  if (!data || data.length < 2) return flatLine;
  const max = Math.max(...data);
  const min = Math.min(...data);
  if (max === min) return flatLine;

  const stepX = (w - pad * 2) / (data.length - 1);
  const range = max - min;
  const points = data
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + (1 - (v - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className={className} aria-hidden="true">
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}
