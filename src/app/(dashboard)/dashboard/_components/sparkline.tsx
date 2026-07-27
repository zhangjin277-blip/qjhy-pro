"use client";

import { useId } from "react";

/**
 * 简易 SVG sparkline，无依赖。
 *
 * - 数据全 0 或长度 < 2 → 画一条平直中线
 * - 默认尺寸 96 x 28，颜色走图表语义 token
 * - viewBox 自适应，外部用 className 控制大小
 * - fill=true 时画渐变面积（KPI 卡走势用）；fillColor 直接给纯色（hero 卡水波用）
 */
export function Sparkline({
  data,
  width = 96,
  height = 28,
  stroke = "var(--chart-current)",
  fill = false,
  fillColor,
  fillOpacity = 0.18,
  strokeWidth = 1.5,
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: boolean;
  /** 给定时面积用此纯色填充（不画渐变），适合深色底上的白色水波 */
  fillColor?: string;
  /** 渐变面积的顶部透明度 */
  fillOpacity?: number;
  strokeWidth?: number;
  className?: string;
}): React.JSX.Element {
  const gradId = useId();
  const pad = 2;
  const w = width;
  const h = height;

  const flatLine = (lineStroke = "var(--chart-baseline)", lineWidth = 1) => (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className={className} aria-hidden="true">
      <line
        x1={pad}
        y1={h / 2}
        x2={w - pad}
        y2={h / 2}
        stroke={lineStroke}
        strokeWidth={lineWidth}
        strokeDasharray="2,3"
      />
    </svg>
  );

  if (!data || data.length < 2) return flatLine();
  const max = Math.max(...data);
  const min = Math.min(...data);
  if (max === min) return flatLine(stroke, strokeWidth);

  const stepX = (w - pad * 2) / (data.length - 1);
  const range = max - min;
  const xy = data.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return [x, y] as const;
  });
  const points = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath =
    `M${xy[0]?.[0].toFixed(1)},${h} ` +
    xy.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(" ") +
    ` L${xy[xy.length - 1]?.[0].toFixed(1)},${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className={className} aria-hidden="true">
      {(fill || fillColor) && (
        <>
          {!fillColor && (
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={stroke} stopOpacity={fillOpacity} />
                <stop offset="1" stopColor={stroke} stopOpacity="0" />
              </linearGradient>
            </defs>
          )}
          <path d={areaPath} fill={fillColor ?? `url(#${gradId})`} stroke="none" />
        </>
      )}
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}
