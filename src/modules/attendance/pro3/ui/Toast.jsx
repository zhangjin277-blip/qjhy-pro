"use client";
// src/components/Toast.jsx
// 全局 Toast 通知组件 - 替代 alert() 弹窗
import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

// 全局事件管理
const listeners = new Set();
let toastId = 0;

// 外部调用接口
export const toast = {
    success: (message, duration = 3000) => emit({ type: 'success', message, duration }),
    error: (message, duration = 4000) => emit({ type: 'error', message, duration }),
    warning: (message, duration = 3500) => emit({ type: 'warning', message, duration }),
    info: (message, duration = 3000) => emit({ type: 'info', message, duration }),
};

function emit(data) {
    const id = ++toastId;
    listeners.forEach(fn => fn({ ...data, id }));
    return id;
}

// Toast 图标和样式配置
const TOAST_CONFIG = {
    success: {
        icon: CheckCircle,
        bg: 'bg-gradient-to-r from-emerald-400 to-emerald-500',
        iconColor: 'text-white',
    },
    error: {
        icon: XCircle,
        bg: 'bg-gradient-to-r from-red-400 to-red-500',
        iconColor: 'text-white',
    },
    warning: {
        icon: AlertCircle,
        bg: 'bg-gradient-to-r from-amber-400 to-amber-500',
        iconColor: 'text-white',
    },
    info: {
        icon: Info,
        bg: 'bg-gradient-to-r from-blue-400 to-blue-500',
        iconColor: 'text-white',
    },
};

// 单个 Toast 项
function ToastItem({ toast: t, onRemove }) {
    const [isLeaving, setIsLeaving] = useState(false);
    const config = TOAST_CONFIG[t.type] || TOAST_CONFIG.info;
    const Icon = config.icon;

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsLeaving(true);
            setTimeout(() => onRemove(t.id), 300);
        }, t.duration);

        return () => clearTimeout(timer);
    }, [t.id, t.duration, onRemove]);

    const handleClose = () => {
        setIsLeaving(true);
        setTimeout(() => onRemove(t.id), 300);
    };

    return (
        <div
            className={`
                flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg backdrop-blur-sm
                ${config.bg} text-white min-w-[280px] max-w-[400px]
                transition-all duration-300 ease-out
                ${isLeaving ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0'}
            `}
        >
            <Icon className={`w-5 h-5 shrink-0 ${config.iconColor}`} />
            <span className="flex-1 text-sm font-medium">{t.message}</span>
            <button
                onClick={handleClose}
                className="p-1 hover:bg-white/20 rounded-lg transition-colors shrink-0"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}

// Toast 容器组件 - 放在 App 根组件中
export function ToastContainer() {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((toast) => {
        setToasts(prev => [...prev, toast]);
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    useEffect(() => {
        listeners.add(addToast);
        return () => listeners.delete(addToast);
    }, [addToast]);

    if (toasts.length === 0) return null;

    return (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2">
            {toasts.map(t => (
                <ToastItem key={t.id} toast={t} onRemove={removeToast} />
            ))}
        </div>
    );
}

export default toast;
