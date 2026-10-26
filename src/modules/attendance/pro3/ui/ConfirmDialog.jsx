"use client";
// src/components/ConfirmDialog.jsx
// --- 自定义确认对话框组件 ---

import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

// 全局状态管理
let showConfirmDialog = null;

function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, type = 'warning', confirmText = '确定', cancelText = '取消' }) {
    if (!isOpen) return null;

    const typeConfig = {
        warning: {
            icon: AlertTriangle,
            iconBg: 'bg-yellow-100',
            iconColor: 'text-yellow-600',
            btnBg: 'bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600',
        },
        danger: {
            icon: AlertCircle,
            iconBg: 'bg-red-100',
            iconColor: 'text-red-600',
            btnBg: 'bg-gradient-to-r from-red-400 to-red-500 hover:from-red-500 hover:to-red-600',
        },
        info: {
            icon: Info,
            iconBg: 'bg-blue-100',
            iconColor: 'text-blue-600',
            btnBg: 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700',
        },
    };

    const config = typeConfig[type] || typeConfig.warning;
    const IconComponent = config.icon;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
            {/* 遮罩层 */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* 对话框 */}
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 transform animate-in fade-in zoom-in duration-200">
                {/* 关闭按钮 */}
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 p-1 rounded-full hover:bg-slate-100 transition-colors"
                >
                    <X className="w-4 h-4 text-slate-400" />
                </button>

                <div className="p-6">
                    {/* 图标 */}
                    <div className={`w-12 h-12 rounded-full ${config.iconBg} flex items-center justify-center mx-auto mb-4`}>
                        <IconComponent className={`w-6 h-6 ${config.iconColor}`} />
                    </div>

                    {/* 标题 */}
                    <h3 className="text-lg font-bold text-slate-800 text-center mb-2">
                        {title}
                    </h3>

                    {/* 消息内容 - 支持多行 */}
                    <div className="text-sm text-slate-600 text-center whitespace-pre-line mb-6">
                        {message}
                    </div>

                    {/* 按钮组 */}
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={onConfirm}
                            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-bold text-white ${config.btnBg} shadow-sm transition-all`}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// 全局容器组件 - 需要在 App.jsx 中添加
export function ConfirmContainer() {
    const [dialogState, setDialogState] = useState({
        isOpen: false,
        title: '',
        message: '',
        type: 'warning',
        confirmText: '确定',
        cancelText: '取消',
        resolve: null,
    });

    useEffect(() => {
        showConfirmDialog = (options) => {
            return new Promise((resolve) => {
                setDialogState({
                    isOpen: true,
                    title: options.title || '确认',
                    message: options.message || '',
                    type: options.type || 'warning',
                    confirmText: options.confirmText || '确定',
                    cancelText: options.cancelText || '取消',
                    resolve,
                });
            });
        };

        return () => {
            showConfirmDialog = null;
        };
    }, []);

    const handleClose = useCallback(() => {
        dialogState.resolve?.(false);
        setDialogState(prev => ({ ...prev, isOpen: false }));
    }, [dialogState.resolve]);

    const handleConfirm = useCallback(() => {
        dialogState.resolve?.(true);
        setDialogState(prev => ({ ...prev, isOpen: false }));
    }, [dialogState.resolve]);

    return (
        <ConfirmDialog
            isOpen={dialogState.isOpen}
            onClose={handleClose}
            onConfirm={handleConfirm}
            title={dialogState.title}
            message={dialogState.message}
            type={dialogState.type}
            confirmText={dialogState.confirmText}
            cancelText={dialogState.cancelText}
        />
    );
}

// 全局调用方法
export const confirm = {
    /**
     * 显示确认对话框
     * @param {string} message - 消息内容
     * @param {string} title - 标题
     * @param {string} type - 类型: 'warning' | 'danger' | 'info'
     * @returns {Promise<boolean>}
     */
    show: (message, title = '确认', type = 'warning') => {
        if (!showConfirmDialog) {
            console.warn('ConfirmContainer 未挂载，回退到原生 confirm');
            return Promise.resolve(window.confirm(message));
        }
        return showConfirmDialog({ message, title, type });
    },

    /**
     * 危险操作确认 (红色)
     */
    danger: (message, title = '危险操作') => {
        return confirm.show(message, title, 'danger');
    },

    /**
     * 警告确认 (黄色)
     */
    warning: (message, title = '确认操作') => {
        return confirm.show(message, title, 'warning');
    },

    /**
     * 信息确认 (蓝色)
     */
    info: (message, title = '提示') => {
        return confirm.show(message, title, 'info');
    },
};

export default ConfirmDialog;
