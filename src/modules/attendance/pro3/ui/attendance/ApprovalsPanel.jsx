"use client";
// src/views/attendance/ApprovalsPanel.jsx
// Version: V9.5.0 - 审批记录面板
import React from 'react';
import { Search } from 'lucide-react';
import Pagination from '../Pagination';
import { Button } from '../components';
import { APPROVAL_TYPE_MAP, APPROVAL_STATUS_MAP, quickDates } from './attendanceConstants';
import { getDateRange } from '../dateUtils';

export default function ApprovalsPanel({
    loading, approvals, approvalPagination, loadApprovals,
    dateRange, setDateRange, deptFilter, setDeptFilter, nameFilter, setNameFilter,
    approvalTypeFilter, setApprovalTypeFilter, approvalStatusFilter, setApprovalStatusFilter,
    departments
}) {
    return (
        <>
            {/* 审批记录筛选栏 */}
            <div className="bg-white rounded-xl border border-slate-200 p-3 mb-4">
                <div className="flex flex-wrap items-center gap-2">
                    {quickDates.map(q => {
                        const r = getDateRange(q.value);
                        const active = dateRange.start === r.start && dateRange.end === r.end;
                        return (
                            <button
                                key={q.value}
                                onClick={() => setDateRange(r)}
                                className={`px-2 py-1 rounded text-xs transition-colors ${
                                    active ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                {q.label}
                            </button>
                        );
                    })}

                    <div className="w-px h-5 bg-slate-200 mx-1" />

                    <input type="date" value={dateRange.start} onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="px-2 py-1 border border-slate-200 rounded text-xs outline-none focus:border-primary" />
                    <span className="text-xs text-slate-400">~</span>
                    <input type="date" value={dateRange.end} onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="px-2 py-1 border border-slate-200 rounded text-xs outline-none focus:border-primary" />

                    <div className="w-px h-5 bg-slate-200 mx-1" />

                    <select value={approvalTypeFilter} onChange={e => setApprovalTypeFilter(e.target.value)} className="px-2 py-1 border border-slate-200 rounded text-xs outline-none focus:border-blue-400 bg-white">
                        <option value="">全部类型</option>
                        {Object.entries(APPROVAL_TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>

                    <select value={approvalStatusFilter} onChange={e => setApprovalStatusFilter(e.target.value)} className="px-2 py-1 border border-slate-200 rounded text-xs outline-none focus:border-blue-400 bg-white">
                        <option value="">全部状态</option>
                        <option value="agree">已通过</option>
                        <option value="refuse">已拒绝</option>
                        <option value="running">审批中</option>
                    </select>

                    <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="px-2 py-1 border border-slate-200 rounded text-xs outline-none focus:border-blue-400 bg-white">
                        <option value="">全部部门</option>
                        {departments.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>

                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300" />
                        <input value={nameFilter} onChange={e => setNameFilter(e.target.value)} placeholder="搜索姓名" className="pl-6 pr-2 py-1 border border-slate-200 rounded text-xs outline-none focus:border-primary w-28" />
                    </div>

                    <Button size="sm" variant="primary" icon={Search} onClick={() => loadApprovals()}>查询</Button>
                </div>
            </div>

            {/* 审批记录表 */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1000px]">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/80">
                                <th className="text-left px-3 py-2 text-xs-plus font-semibold text-slate-500">类型</th>
                                <th className="text-left px-3 py-2 text-xs-plus font-semibold text-slate-500">申请人</th>
                                <th className="text-left px-3 py-2 text-xs-plus font-semibold text-slate-500">部门</th>
                                <th className="text-left px-3 py-2 text-xs-plus font-semibold text-slate-500">开始时间</th>
                                <th className="text-left px-3 py-2 text-xs-plus font-semibold text-slate-500">结束时间</th>
                                <th className="text-center px-3 py-2 text-xs-plus font-semibold text-slate-500">时长(h)</th>
                                <th className="text-left px-3 py-2 text-xs-plus font-semibold text-slate-500">假别/原因</th>
                                <th className="text-center px-3 py-2 text-xs-plus font-semibold text-slate-500">状态</th>
                                <th className="text-left px-3 py-2 text-xs-plus font-semibold text-slate-500">提交时间</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={10} className="text-center py-12 text-sm text-slate-400">加载中...</td></tr>
                            ) : approvals.length === 0 ? (
                                <tr><td colSpan={10} className="text-center py-12 text-sm text-slate-400">暂无审批数据</td></tr>
                            ) : approvals.map((a, i) => {
                                const typeInfo = APPROVAL_TYPE_MAP[a.approval_type] || { label: a.approval_type, color: 'text-slate-600 bg-slate-50' };
                                const statusKey = a.status === 'COMPLETED' ? (a.result === 'agree' ? 'agree' : 'refuse') : 'running';
                                const statusInfo = APPROVAL_STATUS_MAP[statusKey] || { label: a.status, color: 'text-slate-400 bg-slate-50' };
                                return (
                                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                        <td className="px-3 py-2">
                                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs-plus font-medium ${typeInfo.color}`}>{typeInfo.label}</span>
                                        </td>
                                        <td className="px-3 py-2 text-xs font-medium text-slate-800">{a.originator_name}</td>
                                        <td className="px-3 py-2 text-xs text-slate-500">{a.dept_name || '—'}</td>
                                        <td className="px-3 py-2 text-xs text-slate-600 font-mono">{a.start_time ? a.start_time.slice(0, 16) : '—'}</td>
                                        <td className="px-3 py-2 text-xs text-slate-600 font-mono">{a.end_time ? a.end_time.slice(0, 16) : '—'}</td>
                                        <td className="px-3 py-2 text-xs text-center text-slate-600">{a.duration_hours || '—'}</td>
                                        <td className="px-3 py-2 text-xs text-slate-500 max-w-[200px] truncate" title={a.leave_type ? `${a.leave_type} - ${a.reason || ''}` : (a.reason || '')}>
                                            {a.leave_type ? <span className="text-purple-500 mr-1">[{a.leave_type}]</span> : null}
                                            {a.reason || '—'}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs-plus font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
                                        </td>
                                        <td className="px-3 py-2 text-xs-plus text-slate-400 font-mono">{a.create_time ? a.create_time.slice(0, 16) : '—'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* 审批分页 */}
                <Pagination
                    currentPage={approvalPagination.page}
                    totalCount={approvalPagination.total}
                    pageSize={approvalPagination.page_size}
                    onPageChange={(p) => loadApprovals(p)}
                />
            </div>
        </>
    );
}
