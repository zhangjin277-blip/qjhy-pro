"use client";
// src/views/attendance/SyncPanel.jsx
// Version: V9.5.0 - 数据同步面板
import React from 'react';
import { RefreshCw, ChevronLeft, ChevronRight, CalendarDays, Layers, Clock3 } from 'lucide-react';
import { Button, IconButton } from '../components';
import { COMMON_PAGE_SIZE } from './attendanceConstants';
import RosterSyncPanel from './RosterSyncPanel';

function formatSyncDate(value) {
    const text = String(value || '');
    return /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(text) ? text.slice(0, 10) : text || '—';
}
function formatSyncTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
}

export default function SyncPanel({
    syncing, syncDate, setSyncDate, handleSync, canSyncAttendance,
    syncRange, setSyncRange, handleSyncRange,
    syncLogs, loadSyncLogs, syncPage, setSyncPage
}) {
    return (
        <div className="space-y-4">
            <div className="attendance-sync-schedule">
                <Clock3 size={16} />
                <span>自动同步</span>
                <strong>09:00</strong><span>前一天考勤与审批</span>
                <span className="attendance-sync-divider">·</span>
                <strong>09:01</strong><span>当月表格休息</span>
                <span className="attendance-sync-timezone">北京时间</span>
            </div>
            <div className="attendance-sync-grid">
                <div className="attendance-sync-card">
                    <div className="attendance-sync-heading">
                        <span className="attendance-sync-icon"><CalendarDays size={18} /></span>
                        <h3>单日同步</h3>
                        <span className="attendance-sync-badge">每天 09:00</span>
                    </div>
                    <p className="attendance-sync-description">补充指定日期的考勤打卡与审批记录。</p>
                    <div className="attendance-sync-fields">
                        <label>同步日期<input type="date" value={syncDate} disabled={syncing} onChange={e => setSyncDate(e.target.value)} /></label>
                    </div>
                    <div className="attendance-sync-action">
                        <Button size="sm" variant="primary" icon={RefreshCw} onClick={handleSync} disabled={syncing || !canSyncAttendance} loading={syncing} title={!canSyncAttendance ? '无操作权限' : ''}>
                            {syncing ? '同步中...' : '同步考勤与审批'}
                        </Button>
                    </div>
                </div>
                <div className="attendance-sync-card">
                    <div className="attendance-sync-heading">
                        <span className="attendance-sync-icon"><Layers size={18} /></span>
                        <h3>批量同步</h3>
                        <span className="attendance-sync-badge attendance-sync-badge-muted">最多 31 天</span>
                    </div>
                    <p className="attendance-sync-description">按日期范围补充考勤打卡与审批记录。</p>
                    <div className="attendance-sync-fields attendance-sync-range">
                        <label>开始日期<input type="date" value={syncRange.start} disabled={syncing} onChange={e => setSyncRange(prev => ({ ...prev, start: e.target.value }))} /></label>
                        <label>结束日期<input type="date" value={syncRange.end} disabled={syncing} onChange={e => setSyncRange(prev => ({ ...prev, end: e.target.value }))} /></label>
                    </div>
                    <div className="attendance-sync-action">
                        <Button size="sm" variant="primary" icon={RefreshCw} onClick={handleSyncRange} disabled={syncing || !canSyncAttendance} loading={syncing} title={!canSyncAttendance ? '无操作权限' : ''}>
                            {syncing ? '同步中...' : '批量同步'}
                        </Button>
                    </div>
                </div>
                <RosterSyncPanel canSyncAttendance={canSyncAttendance} />
            </div>

            {/* 同步日志 */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
                    <div><h3 className="text-sm font-bold text-slate-700">考勤同步记录</h3><p className="text-xs text-slate-400 mt-1">共 {syncLogs.length} 条记录 · 时间为北京时间</p></div>
                    <Button variant="ghost" size="sm" onClick={loadSyncLogs} className="!text-xs !text-primary">刷新</Button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full attendance-sync-table">
                        <thead>
                            <tr className="border-b border-slate-50 bg-slate-50/50">
                                <th className="text-left px-3 py-2 text-xs-plus font-semibold text-slate-500">同步日期</th>
                                <th className="text-center px-3 py-2 text-xs-plus font-semibold text-slate-500">总人数</th>
                                <th className="text-center px-3 py-2 text-xs-plus font-semibold text-green-600">成功</th>
                                <th className="text-center px-3 py-2 text-xs-plus font-semibold text-slate-400">跳过</th>
                                <th className="text-center px-3 py-2 text-xs-plus font-semibold text-red-500">失败</th>
                                <th className="text-left px-3 py-2 text-xs-plus font-semibold text-slate-500">触发方式</th>
                                <th className="text-left px-3 py-2 text-xs-plus font-semibold text-slate-500">时间</th>
                            </tr>
                        </thead>
                        <tbody>
                            {syncLogs.length === 0 ? (
                                <tr><td colSpan={7} className="text-center py-8 text-sm text-slate-400">暂无同步记录</td></tr>
                            ) : syncLogs.slice((syncPage - 1) * COMMON_PAGE_SIZE, syncPage * COMMON_PAGE_SIZE).map((log, i) => (
                                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                                    <td className="px-3 py-2 text-xs font-mono text-slate-600">{formatSyncDate(log.sync_date)}</td>
                                    <td className="px-3 py-2 text-xs text-center text-slate-600">{log.total}</td>
                                    <td className="px-3 py-2 text-xs text-center text-green-600 font-medium">{log.synced}</td>
                                    <td className="px-3 py-2 text-xs text-center text-slate-400">{log.skipped}</td>
                                    <td className="px-3 py-2 text-xs text-center">
                                        {log.failed > 0 ? <span className="text-red-500 font-medium">{log.failed}</span> : <span className="text-slate-300">0</span>}
                                    </td>
                                    <td className="px-3 py-2 text-xs text-slate-500">
                                        {String(log.triggered_by || '').startsWith('cron') ? '自动同步' : log.triggered_by || '手动同步'}
                                    </td>
                                    <td className="px-3 py-2 text-xs-plus text-slate-400">{formatSyncTime(log.created_at)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {(() => { const tp = Math.ceil(syncLogs.length / COMMON_PAGE_SIZE); return tp > 1 ? (
                    <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100">
                        <span className="text-xs-plus text-slate-400">共 {syncLogs.length} 条，第 {syncPage}/{tp} 页</span>
                        <div className="flex items-center gap-1">
                            <IconButton icon={ChevronLeft} variant="ghost" size="sm" onClick={() => setSyncPage(p => Math.max(1, p - 1))} disabled={syncPage <= 1} title="上一页" />
                            <IconButton icon={ChevronRight} variant="ghost" size="sm" onClick={() => setSyncPage(p => Math.min(tp, p + 1))} disabled={syncPage >= tp} title="下一页" />
                        </div>
                    </div>
                ) : null; })()}
            </div>

            {/* 说明 */}
            <p className="text-xs text-slate-400">
                审批记录每天 09:00 自动同步前一天，也可通过单日或批量同步补充，包含请假、补卡、外出、加班、出差及无法开播。
            </p>
        </div>
    );
}
