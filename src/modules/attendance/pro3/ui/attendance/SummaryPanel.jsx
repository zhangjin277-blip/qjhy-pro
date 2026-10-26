"use client";
// src/views/attendance/SummaryPanel.jsx
// Version: V9.5.0 - 考勤汇总面板（矩阵+表格视图）
import React from 'react';
import { AuthService } from '../services';
import { Search, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { SUMMARY_PAGE_SIZE } from './attendanceConstants';
import { SegmentedControl, Button, IconButton } from '../components';

export default function SummaryPanel({
    loading, summary, summaryView, setSummaryView, summaryPage, setSummaryPage,
    matrixData, matrixMonth, setMatrixMonth, matrixLoading, loadMatrix, loadSummary,
    summaryDeptFilter, setSummaryDeptFilter, nameFilter, setNameFilter, departmentGroups,
    staffHolidays, setStaffHolidays, canManageAttendance,
    openCalendar, tableOnly = false, onOpenDetails, showLateAllowances = false, showFlexibleLate = true
}) {
    return (
        <div className="space-y-3">
            {/* 视图切换 + 月份选择 + 搜索 */}
            <div className="flex items-center gap-3 flex-wrap">
                {!tableOnly && <SegmentedControl
                    size="sm"
                    value={summaryView}
                    onChange={(val) => {
                        setSummaryPage(1);
                        setSummaryView(val);
                        if (val === 'table') loadSummary();
                    }}
                    options={[
                        { value: 'matrix', label: '矩阵视图' },
                        { value: 'table', label: '表格视图' },
                    ]}
                />}
                {summaryView === 'matrix' && (
                    <div className="flex items-center gap-1">
                        <IconButton icon={ChevronLeft} variant="ghost" size="sm" onClick={() => { const [y,m]=matrixMonth.split('-').map(Number); const d=new Date(y,m-2,1); const nm=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; setMatrixMonth(nm); loadMatrix(nm); }} title="上个月" />
                        <span className="text-sm font-medium text-slate-700 min-w-[80px] text-center">{matrixMonth}</span>
                        <IconButton icon={ChevronRight} variant="ghost" size="sm" onClick={() => { const [y,m]=matrixMonth.split('-').map(Number); const d=new Date(y,m,1); const nm=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; setMatrixMonth(nm); loadMatrix(nm); }} title="下个月" />
                    </div>
                )}
                <select value={summaryDeptFilter} onChange={e => { setSummaryDeptFilter(e.target.value); setSummaryPage(1); }} className="px-2 py-1 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-400">
                    <option value="">全部部门</option>
                    {departmentGroups.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input value={nameFilter} onChange={e => setNameFilter(e.target.value)} placeholder="搜索姓名" className="pl-7 pr-2 py-1 border border-slate-200 rounded-lg text-xs outline-none focus:border-primary w-28" />
                </div>
                <Button size="sm" variant="primary" icon={Search} onClick={() => summaryView === 'matrix' ? loadMatrix() : loadSummary()}>查询</Button>
                {canManageAttendance && summaryView === 'matrix' && (<>
                    <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-slate-200">
                        <span className="text-2xs text-slate-500 whitespace-nowrap">职能节假日:</span>
                        <div className="flex items-center gap-0.5">
                            <input type="number" min="0" max="15" value={staffHolidays} onChange={e => setStaffHolidays(Number(e.target.value) || 0)} className="w-10 px-1 py-0.5 border border-slate-200 rounded text-xs text-center outline-none focus:border-primary" />
                            <span className="text-2xs text-slate-400">天</span>
                        </div>
                        <span className="text-2xs text-slate-400">(公休按个人设置自动计算)</span>
                    </div>
                    <Button
                        size="sm"
                        variant="secondary"
                        icon={Download}
                        className="!bg-emerald-500 !text-white hover:!bg-emerald-600 !border-emerald-500"
                        onClick={async () => {
                            const [y, m] = matrixMonth.split('-').map(Number);
                            const lastDay = new Date(y, m, 0).getDate();
                            const sd = `${matrixMonth}-01`;
                            const ed = `${matrixMonth}-${String(lastDay).padStart(2, '0')}`;
                            try {
                                const { default: toast } = await import('../Toast');
                                toast.success('正在生成报表...');
                                const res = await fetch(`/api/attendance/pro3/attendance/export?start_date=${sd}&end_date=${ed}&staff_holidays=${staffHolidays}`, {
                                    headers: AuthService.getAuthHeaders()
                                });
                                if (!res.ok) throw new Error('导出失败');
                                const blob = await res.blob();
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `长沙奇迹互娱科技有限公司_考勤报表_${sd}_${ed}.xlsx`;
                                a.click();
                                URL.revokeObjectURL(url);
                            } catch (e) {
                                const { default: toast } = await import('../Toast');
                                toast.error('导出失败: ' + e.message);
                            }
                        }}
                    >导出报表</Button>
                </>)}
                {/* 图例 */}
                {summaryView === 'matrix' && (
                    <div className="flex items-center gap-2 ml-auto text-2xs text-slate-500">
                        <span className="flex items-center gap-0.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-400" />正常</span>
                        <span className="flex items-center gap-0.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400" />迟到</span>
                        <span className="flex items-center gap-0.5"><span className="w-2.5 h-2.5 rounded-sm bg-orange-400" />早退</span>
                        <span className="flex items-center gap-0.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" />缺卡</span>
                        <span className="flex items-center gap-0.5"><span className="w-2.5 h-2.5 rounded-sm bg-purple-400" />请假</span>
                        <span className="flex items-center gap-0.5"><span className="w-2.5 h-2.5 rounded-sm bg-cyan-400" />外出</span>
                        <span className="flex items-center gap-0.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-400" />补卡</span>
                        <span className="flex items-center gap-0.5"><span className="w-2.5 h-2.5 rounded-sm bg-teal-400" />已说明</span>
                        <span className="flex items-center gap-0.5"><span className="w-2.5 h-2.5 rounded-sm bg-slate-200" />休息</span>
                    </div>
                )}
            </div>

            {/* 矩阵视图 */}
            {summaryView === 'matrix' && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        {matrixLoading ? (
                            <div className="text-center py-12 text-sm text-slate-400">加载中...</div>
                        ) : !matrixData || matrixData.people.length === 0 ? (
                            <div className="text-center py-12 text-sm text-slate-400">暂无数据</div>
                        ) : (() => {
                            const { people: allPeople, lastDay } = matrixData;
                            const matrixTotalPages = Math.ceil(allPeople.length / SUMMARY_PAGE_SIZE);
                            const people = allPeople.slice((summaryPage - 1) * SUMMARY_PAGE_SIZE, summaryPage * SUMMARY_PAGE_SIZE);
                            const [year, mon] = matrixMonth.split('-').map(Number);
                            const statusColors = {
                                normal: 'bg-green-400', late: 'bg-amber-400', early: 'bg-orange-400',
                                missing: 'bg-red-400', leave: 'bg-purple-400', goout: 'bg-cyan-400',
                                trip: 'bg-cyan-400', repair: 'bg-blue-400', overtime: 'bg-amber-300',
                                verified: 'bg-teal-400', remarked: 'bg-teal-300', rest: 'bg-slate-100', none: 'bg-white border border-slate-100'
                            };
                            const statusTips = {
                                normal: '正常', late: '迟到', early: '早退', missing: '缺卡',
                                leave: '请假', goout: '外出', trip: '出差', repair: '补卡',
                                overtime: '加班', verified: '已说明', remarked: '待核实', rest: '休息', none: ''
                            };
                            const table_el = (
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-slate-100 bg-slate-50/80">
                                            <th className="text-left px-2 py-1.5 text-xs-plus font-semibold text-slate-500 sticky left-0 bg-slate-50/80 z-10 min-w-[60px]">姓名</th>
                                            {Array.from({ length: lastDay }, (_, i) => {
                                                const d = new Date(year, mon - 1, i + 1);
                                                const isWk = d.getDay() % 6 === 0;
                                                return <th key={i} className={`text-center px-0 py-1.5 text-2xs font-medium min-w-[24px] ${isWk ? 'text-slate-300' : 'text-slate-500'}`}>{i + 1}</th>;
                                            })}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {people.map((p, pi) => (
                                            <tr key={pi} className="border-b border-slate-50 hover:bg-slate-50/30">
                                                <td className="px-2 py-1 text-xs-plus font-medium text-slate-700 sticky left-0 bg-white z-10 whitespace-nowrap">
                                                    <Button variant="ghost" size="sm" onClick={() => openCalendar(p.name, p.dept_name, matrixMonth)} className="!p-0 !text-primary hover:!underline !font-medium">{p.name}</Button>
                                                    {p.team_name && <span className="text-3xs text-slate-400 ml-1">{p.team_name}</span>}
                                                </td>
                                                {Array.from({ length: lastDay }, (_, i) => {
                                                    const day = i + 1;
                                                    const cell = p.days[day] || { status: 'none' };
                                                    const finalColor = cell.seriousLate ? 'bg-red-400' : (statusColors[cell.status] || statusColors.none);
                                                    const tipText = cell.graceLate ? '迟到(免)' : (cell.seriousLate ? '严重迟到' : (statusTips[cell.status] || ''));
                                                    const tip = `${matrixMonth}-${String(day).padStart(2,'0')} ${tipText}${cell.extra ? '('+cell.extra+')' : ''}`;
                                                    return (
                                                        <td key={i} className="px-0 py-1 text-center">
                                                            <div
                                                                className={`w-5 h-5 mx-auto rounded-sm cursor-pointer transition-all hover:scale-125 hover:ring-2 hover:ring-blue-300 ${finalColor} relative flex items-center justify-center`}
                                                                title={tip}
                                                                onClick={() => openCalendar(p.name, p.dept_name, matrixMonth)}
                                                            >
                                                                {cell.graceLate && <span className="text-[8px] font-bold text-white leading-none">迟</span>}
                                                                {cell.seriousLate && <span className="text-[8px] font-bold text-white leading-none">迟</span>}
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            );
                            return (<>{table_el}{matrixTotalPages > 1 && (
                                <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100">
                                    <span className="text-xs-plus text-slate-400">共 {allPeople.length} 人，第 {summaryPage}/{matrixTotalPages} 页</span>
                                    <div className="flex items-center gap-1">
                                        <IconButton icon={ChevronLeft} variant="ghost" size="sm" onClick={() => setSummaryPage(p => Math.max(1, p - 1))} disabled={summaryPage <= 1} title="上一页" />
                                        <IconButton icon={ChevronRight} variant="ghost" size="sm" onClick={() => setSummaryPage(p => Math.min(matrixTotalPages, p + 1))} disabled={summaryPage >= matrixTotalPages} title="下一页" />
                                    </div>
                                </div>
                            )}</>);
                        })()}
                    </div>
                </div>
            )}

            {/* 表格视图（保留原汇总表） */}
            {summaryView === 'table' && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1100px]">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/80">
                                    <th className="text-left px-3 py-2 text-xs-plus font-semibold text-slate-500">姓名</th>
                                    <th className="text-left px-3 py-2 text-xs-plus font-semibold text-slate-500">部门</th>
                                    <th className="text-center px-2 py-2 text-xs-plus font-semibold text-slate-500">记录天数</th>
                                    <th className="text-center px-2 py-2 text-xs-plus font-semibold text-green-600">正常</th>
                                    <th className="text-center px-2 py-2 text-xs-plus font-semibold text-amber-600">迟到</th>
                                    {showLateAllowances && <th className="text-center px-2 py-2 text-xs-plus font-semibold text-green-600">迟到（免）</th>}
                                    {showLateAllowances && showFlexibleLate && <th className="text-center px-2 py-2 text-xs-plus font-semibold text-primary">弹性10分钟</th>}
                                    <th className="text-center px-2 py-2 text-xs-plus font-semibold text-orange-600">早退</th>
                                    <th className="text-center px-2 py-2 text-xs-plus font-semibold text-red-500">缺卡</th>
                                    <th className="text-center px-2 py-2 text-xs-plus font-semibold text-purple-600">请假</th>
                                    <th className="text-center px-2 py-2 text-xs-plus font-semibold text-cyan-600">外出</th>
                                    <th className="text-center px-2 py-2 text-xs-plus font-semibold text-primary">补卡</th>
                                    <th className="text-center px-2 py-2 text-xs-plus font-semibold text-teal-600">已说明</th>
                                    <th className="text-left px-2 py-2 text-xs-plus font-semibold text-slate-500">出勤率</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={12 + (showLateAllowances ? 1 + Number(showFlexibleLate) : 0)} className="text-center py-12 text-sm text-slate-400">加载中...</td></tr>
                                ) : summary.length === 0 ? (
                                    <tr><td colSpan={12 + (showLateAllowances ? 1 + Number(showFlexibleLate) : 0)} className="text-center py-12 text-sm text-slate-400">暂无数据</td></tr>
                                ) : summary.slice((summaryPage - 1) * SUMMARY_PAGE_SIZE, summaryPage * SUMMARY_PAGE_SIZE).map((s, i) => {
                                    const coveredDays = (s.leave_days || 0) + (s.repair_check_count || 0) + (s.verified_days || 0) + (s.go_out_days || 0) + (s.business_trip_days || 0);
                                    const realAbnormal = Math.max(0, (s.missing_punch_days || 0) + (s.absent_days_count || 0) - Math.ceil(coveredDays));
                                    const rate = s.total_days > 0 ? Math.round((s.total_days - realAbnormal) / s.total_days * 100) : 100;
                                    return (
                                    <tr
                                        key={i}
                                        className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${onOpenDetails ? 'cursor-pointer' : ''}`}
                                        onClick={onOpenDetails ? (event) => {
                                            if (!event.target.closest('button, a, input, select')) onOpenDetails(s);
                                        } : undefined}
                                        tabIndex={onOpenDetails ? 0 : undefined}
                                        onKeyDown={onOpenDetails ? (event) => {
                                            if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                                                event.preventDefault();
                                                onOpenDetails(s);
                                            }
                                        } : undefined}
                                    >
                                        <td className="px-3 py-2 text-xs font-medium">
                                            <Button variant="ghost" size="sm" onClick={() => onOpenDetails ? onOpenDetails(s) : openCalendar(s.name, s.dept_name)} className="!p-0 !text-primary hover:!underline !font-medium">{s.name}</Button>
                                        </td>
                                        <td className="px-3 py-2 text-xs text-slate-500">{s.dept_name || '—'}</td>
                                        <td className="px-2 py-2 text-xs text-center text-slate-600">{s.total_days}</td>
                                        <td className="px-2 py-2 text-xs text-center text-green-600 font-medium">{s.normal_days}</td>
                                        <td className="px-2 py-2 text-xs text-center">{s.late_days > 0 ? (onOpenDetails ? <button onClick={() => onOpenDetails(s, 'late')} className="text-amber-600 font-medium underline">{s.late_days}</button> : <span className="text-amber-600 font-medium">{s.late_days}</span>) : <span className="text-slate-300">0</span>}</td>
                                        {showLateAllowances && <td className="px-2 py-2 text-xs text-center">{s.grace_late_days > 0 ? <button onClick={() => onOpenDetails(s, 'grace')} className="text-green-600 font-medium underline">{s.grace_late_days}</button> : <span className="text-slate-300">0</span>}</td>}
                                        {showLateAllowances && showFlexibleLate && <td className="px-2 py-2 text-xs text-center">{s.flexible_late_days > 0 ? <button onClick={() => onOpenDetails(s, 'flexible')} className="text-primary font-medium underline">{s.flexible_late_days}</button> : <span className="text-slate-300">0</span>}</td>}
                                        <td className="px-2 py-2 text-xs text-center">{s.early_leave_days > 0 ? (onOpenDetails ? <button onClick={() => onOpenDetails(s, 'early')} className="text-orange-600 font-medium underline">{s.early_leave_days}</button> : <span className="text-orange-600 font-medium">{s.early_leave_days}</span>) : <span className="text-slate-300">0</span>}</td>
                                        <td className="px-2 py-2 text-xs text-center">{realAbnormal > 0 ? <span className="text-red-500 font-medium">{realAbnormal}!</span> : <span className="text-slate-300">0</span>}</td>
                                        <td className="px-2 py-2 text-xs text-center">{s.leave_days > 0 ? <span className="text-purple-600 font-medium">{s.leave_days}天</span> : <span className="text-slate-300">—</span>}</td>
                                        <td className="px-2 py-2 text-xs text-center">{(s.go_out_days||0)+(s.business_trip_days||0) > 0 ? <span className="text-cyan-600 font-medium">{(s.go_out_days||0)+(s.business_trip_days||0)}天</span> : <span className="text-slate-300">—</span>}</td>
                                        <td className="px-2 py-2 text-xs text-center">{s.repair_check_count > 0 ? <span className="text-primary font-medium">{s.repair_check_count}次</span> : <span className="text-slate-300">—</span>}</td>
                                        <td className="px-2 py-2 text-xs text-center">{s.verified_days > 0 ? <span className="text-teal-600 font-medium">{s.verified_days}</span> : s.remark_days > 0 ? <span className="text-amber-500">{s.remark_days}<span className="text-2xs">待核</span></span> : <span className="text-slate-300">—</span>}</td>
                                        <td className="px-2 py-2 text-xs">
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className={`h-full rounded-full ${rate >= 95 ? 'bg-green-500' : rate >= 80 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${rate}%` }} />
                                                </div>
                                                <span className={`text-xs-plus font-medium ${rate >= 95 ? 'text-green-600' : rate >= 80 ? 'text-amber-600' : 'text-red-600'}`}>{rate}%</span>
                                            </div>
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {(() => { const tp = Math.ceil(summary.length / SUMMARY_PAGE_SIZE); return tp > 1 ? (
                        <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100">
                            <span className="text-xs-plus text-slate-400">共 {summary.length} 人，第 {summaryPage}/{tp} 页</span>
                            <div className="flex items-center gap-1">
                                <IconButton icon={ChevronLeft} variant="ghost" size="sm" onClick={() => setSummaryPage(p => Math.max(1, p - 1))} disabled={summaryPage <= 1} title="上一页" />
                                <IconButton icon={ChevronRight} variant="ghost" size="sm" onClick={() => setSummaryPage(p => Math.min(tp, p + 1))} disabled={summaryPage >= tp} title="下一页" />
                            </div>
                        </div>
                    ) : null; })()}
                </div>
            )}
        </div>
    );
}
