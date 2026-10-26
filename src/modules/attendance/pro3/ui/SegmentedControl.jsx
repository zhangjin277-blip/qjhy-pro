"use client";
// src/components/SegmentedControl.jsx
// Version: V1.0.0
// 分段选择器，替代现有的 tab 切换按钮组（如"流水/音浪"、"近7天/本月"）
// 样式消耗 --segmented-* token，定义在 src/styles/components.css

import React from 'react';

/**
 * SegmentedControl — 分段选择器
 *
 * @param {Array<{value: string|number, label: string, icon?: React.ComponentType}>} options - 选项列表
 * @param {string|number} value - 当前选中值
 * @param {(value: string|number) => void} onChange - 选中变化回调
 * @param {'sm'|'md'} size - 尺寸，默认 md
 * @param {string} className - 额外类名
 * @param {string} ariaLabel - 无障碍标签
 */
export default function SegmentedControl({
  options = [],
  value,
  onChange,
  size = 'md',
  className = '',
  ariaLabel,
}) {
  const classes = ['segmented', `segmented-${size}`, className].filter(Boolean).join(' ');

  return (
    <div className={classes} role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => {
        const isActive = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`segmented-item${isActive ? ' segmented-item-active' : ''}`}
            onClick={() => !isActive && onChange?.(opt.value)}
          >
            {Icon && <Icon className="w-3 h-3" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
