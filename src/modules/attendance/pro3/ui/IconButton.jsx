"use client";
// src/components/IconButton.jsx
// Version: V1.0.0
// 纯图标按钮，用于表格行内操作、工具栏、审批通过/拒绝等
// 样式消耗 --iconbtn-* token，定义在 src/styles/components.css

import React, { forwardRef } from 'react';

/**
 * IconButton — 纯图标按钮
 *
 * @param {React.ComponentType} icon - lucide-react 图标组件（必填）
 * @param {'default'|'primary'|'success'|'warning'|'danger'} variant - 色系，默认 default
 * @param {'sm'|'md'|'lg'} size - 尺寸，默认 md
 * @param {string} title - tooltip 提示（原生 title，免得多引一个 tooltip 组件）
 * @param {boolean} disabled - 禁用态
 * @param {string} className - 额外类名
 * @param {() => void} onClick - 点击回调
 * @param {'button'|'submit'} type - 原生 type，默认 'button'
 */
const IconButton = forwardRef(function IconButton(
  {
    icon: Icon,
    variant = 'default',
    size = 'md',
    title,
    disabled = false,
    className = '',
    onClick,
    type = 'button',
    ...rest
  },
  ref
) {
  const classes = [
    'icon-btn',
    `icon-btn-${variant}`,
    `icon-btn-${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      {...rest}
    >
      {Icon && <Icon />}
    </button>
  );
});

export default IconButton;
