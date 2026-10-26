"use client";
// src/views/attendance/RecordsPanel.jsx
// Version: V9.5.0 - 打卡明细面板
import React from 'react';
import Pagination from '../Pagination';
import { Button } from '../components';
import { APPROVAL_TYPE_MAP, getResultBadge } from './attendanceConstants';

export default function RecordsPanel({
    loading, records, sortedRecords, sortKey, sortDir, toggleSort,
    pagination, loadRecords, findApprovalForRecord, openRemarkModal,
    handleVerify, isManager
}) {
    return (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full min-w-[1300px]">
                    <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/80">
                            {[
                                { key: 'work_date', label: '日期' },
                                { key: 'name', label: '姓名' },
                                { key: 'dept_name', label: '部门' },
                                { key: 'on_duty_time', label: '上班打卡' },
                                { key: 'on_duty_result', label: '上班结果' },
                                { key: 'late_minutes', label: '迟到时长' },
                                { key: 'off_duty_time', label: '下班打卡' },
                                { key: 'off_duty_result', label: '下班结果' },
                                { key: null, label: '全部打卡' },
                                { key: null, label: '备注/说明' },
                            ].map(col => (
                                <th key={col.label} className={`text-left px-3 py-2 text-xs-plus font-semibold text-slate-500 ${col.key ? 'cursor-pointer hover:text-primary select-none' : ''}`}
                                    onClick={() => col.key && toggleSort(col.key)}>
                                    {col.label}
                                    {col.key && sortKey === col.key && <span className="ml-0.5 text-primary">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={10} className="text-center py-12 text-sm text-slate-400">加载中...</td></tr>
                        ) : records.length === 0 ? (
                            <tr><td colSpan={10} className="text-center py-12 text-sm text-slate-400">暂无考勤数据，请先同步</td></tr>
                        ) : sortedRecords.map((r, i) => {
                            // 解析所有打卡时间
                            let allTimes = [];
                            try { allTimes = r.all_check_times ? JSON.parse(r.all_check_times) : []; } catch (e) {}
                            // 查找该人该天是否有已通过的审批
                            const matchedApproval = findApprovalForRecord(r.name, r.work_date);
                            const abnormalResults = ['NotSigned', 'Absenteeism', 'Early', 'Late', 'SeriousLate'];
                            const isOnAbnormal = abnormalResults.includes(r.on_duty_result);
                            const isOffAbnormal = abnormalResults.includes(r.off_duty_result);
                            const isRepairCheck = matchedApproval?.approval_type === 'repair_check';
                            const approvalBadge = matchedApproval && !isRepairCheck ? (() => {
                                const typeInfo = APPROVAL_TYPE_MAP[matchedApproval.approval_type] || { label: matchedApproval.approval_type, color: 'text-purple-600 bg-purple-50' };
                                const detail = matchedApproval.leave_type ? `${typeInfo.label}(${matchedApproval.leave_type})` : typeInfo.label;
                                return (
                                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs-plus font-medium ${typeInfo.color}`} title={matchedApproval.reason || ''}>
                                        {detail}
                                    </span>
                                );
                            })() : null;
                            // 补卡：显示补卡时间 + (补) 标记，结果显示正常
                            const repairBadge = <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs-plus font-medium text-green-600 bg-green-50">正常<span className="text-primary ml-0.5">(补)</span></span>;
                            return (
                            <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                <td className="px-3 py-2 text-xs text-slate-600 font-mono">{r.work_date}</td>
                                <td className="px-3 py-2 text-xs font-medium text-slate-800">{r.name}</td>
                                <td className="px-3 py-2 text-xs text-slate-500">{r.dept_name || '—'}</td>
                                <td className="px-3 py-2 text-xs font-mono font-medium">
                                    {isOnAbnormal && approvalBadge ? '—'
                                        : <span className="text-green-600">{r.on_duty_time || '—'}{isRepairCheck && <span className="text-blue-400 text-2xs ml-0.5">(补)</span>}</span>}
                                </td>
                                <td className="px-3 py-2">
                                    {isOnAbnormal && isRepairCheck ? repairBadge
                                        : isOnAbnormal && approvalBadge ? approvalBadge
                                        : getResultBadge(r.on_duty_result)}
                                </td>
                                <td className="px-3 py-2 text-xs text-center">
                                    {r.late_minutes > 0 ? <span className="text-amber-600 font-medium">{r.late_minutes}分钟</span> : <span className="text-slate-300">—</span>}
                                </td>
                                <td className="px-3 py-2 text-xs font-mono font-medium">
                                    {isOffAbnormal && approvalBadge ? '—'
                                        : <span className="text-primary">{r.off_duty_time || '—'}{isRepairCheck && <span className="text-blue-400 text-2xs ml-0.5">(补)</span>}</span>}
                                </td>
                                <td className="px-3 py-2">
                                    {isOffAbnormal && isRepairCheck ? repairBadge
                                        : isOffAbnormal && approvalBadge ? approvalBadge
                                        : getResultBadge(r.off_duty_result)}
                                </td>
                                <td className="px-3 py-2 text-xs-plus text-slate-500 font-mono">
                                    {allTimes.length > 0 ? (
                                        <span title={allTimes.join('、')}>
                                            {allTimes.map((t, j) => (
                                                <span key={j}>
                                                    {j === 0 ? <span className="text-green-600">{t}</span>
                                                     : j === allTimes.length - 1 ? <span className="text-primary">{t}</span>
                                                     : <span>{t}</span>}
                                                    {j < allTimes.length - 1 && <span className="text-slate-300 mx-0.5">&rarr;</span>}
                                                </span>
                                            ))}
                                            <span className="text-slate-400 ml-1">({allTimes.length}次)</span>
                                        </span>
                                    ) : '—'}
                                </td>
                                <td className="px-3 py-2 text-xs-plus max-w-[250px]">
                                    {r.remark ? (
                                        <div className="flex items-center gap-1">
                                            <span className={`truncate ${r.verified_by ? 'text-green-600' : 'text-amber-600'}`} title={`${r.remark}\n备注人: ${r.remark_by || ''}\n${r.verified_by ? '已核实: ' + r.verified_by : '待核实'}`}>
                                                {r.verified_by ? '✓ ' : ''}{r.remark}
                                            </span>
                                            {isManager && !r.verified_by && (
                                                <Button size="sm" variant="ghost" onClick={() => handleVerify(r.id)} className="shrink-0 !text-2xs !px-1.5 !py-0.5 !text-green-600 !bg-green-50 hover:!bg-green-100" title="核实此备注">
                                                    核实
                                                </Button>
                                            )}
                                        </div>
                                    ) : (isOnAbnormal || isOffAbnormal) && !approvalBadge && !isRepairCheck ? (
                                        <Button size="sm" variant="ghost" onClick={() => openRemarkModal(r)} className="!text-2xs !px-1.5 !py-0.5 !bg-slate-100 !text-slate-500 hover:!bg-primary-subtle hover:!text-primary">
                                            添加备注
                                        </Button>
                                    ) : null}
                                </td>
                            </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* 分页 */}
            <Pagination
                currentPage={pagination.page}
                totalCount={pagination.total}
                pageSize={pagination.page_size}
                onPageChange={(p) => loadRecords(p)}
            />
        </div>
    );
}
