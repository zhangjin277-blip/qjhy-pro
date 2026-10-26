"use client";
// src/views/attendance/attendanceConstants.js
// Version: V9.5.0 - 考勤常量配置
import React from 'react';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

// 审批类型映射
export const APPROVAL_TYPE_MAP = {
    'leave': { label: '请假', color: 'text-purple-600 bg-purple-50' },
    'repair_check': { label: '补卡', color: 'text-primary bg-blue-50' },
    'go_out': { label: '外出', color: 'text-cyan-600 bg-cyan-50' },
    'overtime': { label: '加班', color: 'text-amber-600 bg-amber-50' },
    'business_trip': { label: '出差', color: 'text-teal-600 bg-teal-50' },
};

export const APPROVAL_STATUS_MAP = {
    'agree': { label: '已通过', color: 'text-green-600 bg-green-50' },
    'refuse': { label: '已拒绝', color: 'text-red-600 bg-red-50' },
    'running': { label: '审批中', color: 'text-amber-600 bg-amber-50' },
};

// 考勤结果映射
export const RESULT_MAP = {
    'Rest': { label: '休息', color: 'text-slate-500 bg-slate-100' },
    'Normal': { label: '正常', color: 'text-green-600 bg-green-50', icon: CheckCircle },
    'GraceLate': { label: '迟(免)', color: 'text-green-600 bg-green-50', icon: CheckCircle },
    'Late': { label: '迟到', color: 'text-amber-600 bg-amber-50', icon: AlertTriangle },
    'Early': { label: '早退', color: 'text-orange-600 bg-orange-50', icon: AlertTriangle },
    'NotSigned': { label: '缺卡', color: 'text-red-500 bg-red-50', icon: XCircle },
    'Absenteeism': { label: '旷工', color: 'text-red-600 bg-red-50', icon: XCircle },
    'SeriousLate': { label: '严重迟到', color: 'text-red-600 bg-red-50', icon: AlertTriangle },
};

export function getResultBadge(result) {
    const info = RESULT_MAP[result] || { label: result || '—', color: 'text-slate-400 bg-slate-50' };
    return (
        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs-plus font-medium ${info.color}`}>
            {info.label}
        </span>
    );
}

// 快捷日期选项
export const quickDates = [
    { label: '今天', value: 'today' },
    { label: '昨天', value: 'yesterday' },
    { label: '本周', value: 'thisWeek' },
    { label: '本月', value: 'thisMonth' },
    { label: '上月', value: 'lastMonth' },
];

// 通用分页大小
export const SUMMARY_PAGE_SIZE = 20;
export const COMMON_PAGE_SIZE = 20;
