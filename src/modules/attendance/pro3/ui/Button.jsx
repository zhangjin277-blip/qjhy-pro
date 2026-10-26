"use client";
// src/components/Button.jsx
// Version: V1.0.0
// 基础按钮组件，消耗 component token（--button-*）
// 样式定义在 src/styles/components.css

import React, { forwardRef } from 'react';

/**
 * Button 组件
 *
 * @param {'primary'|'secondary'|'ghost'|'danger'|'success'|'warning'} variant - 视觉变体，默认 primary
 * @param {'xs'|'sm'|'md'|'lg'} size - 尺寸，默认 md（xs=22px 用于表格行内紧凑按钮）
 * @param {boolean} loading - 加载态，显示 spinner 并禁用点击
 * @param {boolean} disabled - 禁用态
 * @param {boolean} block - 全宽
 * @param {React.ComponentType} icon - 左侧图标组件（lucide-react 图标）
 * @param {string} className - 额外类名
 * @param {'button'|'submit'|'reset'} type - 原生 type，默认 'button'（避免意外触发表单提交）
 */
const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    block = false,
    icon: Icon,
    className = '',
    type = 'button',
    children,
    onClick,
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading;

  const classes = [
    'btn',
    `btn-${variant}`,
    `btn-${size}`,
    loading && 'btn-loading',
    block && 'btn-block',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      onClick={isDisabled ? undefined : onClick}
      {...rest}
    >
      {Icon && !loading && <Icon className="w-4 h-4" />}
      {children}
    </button>
  );
});

export default Button;
