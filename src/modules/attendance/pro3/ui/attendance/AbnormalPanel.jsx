"use client";
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DataService } from '../services';
import toast from '../Toast';
import SummaryPanel from './SummaryPanel';

const formatDate = date => date.toISOString().slice(0, 10);
function dateRange(period, month) {
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const end = new Date(`${today}T00:00:00Z`);
    const start = new Date(end);
    if (period === 'yesterday') {
        start.setUTCDate(start.getUTCDate() - 1);
        return { start: formatDate(start), end: formatDate(start) };
    }
    if (period === 'week' || period === 'lastWeek') {
        start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
        if (period === 'lastWeek') {
            end.setTime(start.getTime());
            end.setUTCDate(end.getUTCDate() - 1);
            start.setUTCDate(start.getUTCDate() - 7);
        }
    } else if (period === 'month') {
        start.setUTCDate(1);
    } else {
        const [year, mon] = month.split('-').map(Number);
        return { start: `${month}-01`, end: formatDate(new Date(Date.UTC(year, mon, 0))) };
    }
    return { start: formatDate(start), end: formatDate(end) };
}

export default function AbnormalPanel({ departmentGroups, openCalendar, closeCalendar, calendarDocked }) {
    const [period, setPeriod] = useState('yesterday');
    const [month, setMonth] = useState(() => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7));
    const [dept, setDept] = useState('');
    const [name, setName] = useState('');
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const requestId = useRef(0);
    const detailRequestId = useRef(0);
    const [detail, setDetail] = useState(null);
    const calendarTarget = useRef(null);
    const openedCalendarId = useRef(null);
    const range = dateRange(period, month);
    const showFlexibleLate = period === 'month' || period === 'other';
    const load = useCallback(async () => {
        const id = ++requestId.current;
        setLoading(true);
        setPage(1);
        setRows([]);
        try {
            const params = new URLSearchParams({ start_date: range.start, end_date: range.end });
            if (dept) params.set('dept_id', dept);
            if (name) params.set('name', name);
            const res = await DataService.get(`/api/attendance/summary?${params}`);
            if (!res.success) throw new Error(res.message || '加载失败');
            if (id === requestId.current) setRows((res.data || []).filter(person => person.late_days > 0 || person.early_leave_days > 0 || person.grace_late_days > 0 || (showFlexibleLate && person.flexible_late_days > 0)));
        } catch (error) {
            if (id === requestId.current) toast.error('加载异常统计失败: ' + error.message);
        } finally {
            if (id === requestId.current) setLoading(false);
        }
    }, [range.start, range.end, dept, name, showFlexibleLate]);
    useEffect(() => {
        load();
        detailRequestId.current++;
        setDetail(null);
        closeCalendar();
        return () => { requestId.current++; detailRequestId.current++; closeCalendar(); };
    }, [load, closeCalendar]);
    // 等详情容器挂载后，自动将个人考勤嵌入右侧，每次点击只打开一次。
    useEffect(() => {
        if (!detail || !calendarTarget.current || openedCalendarId.current === detail.openId) return;
        openedCalendarId.current = detail.openId;
        openCalendar(detail.person.name, detail.person.dept_name, range.start.slice(0, 7), calendarTarget.current);
    }, [detail, openCalendar, range.start]);
    const openDetails = async (person, kind = 'all') => {
        closeCalendar();
        const id = ++detailRequestId.current;
        setDetail({ openId: id, person, kind, records: [], loading: true, error: '' });
        try {
            const params = new URLSearchParams({ start_date: range.start, end_date: range.end, page_size: '31' });
            if (person.dingtalk_userid) params.set('userid', person.dingtalk_userid);
            else params.set('name', person.name);
            const res = await DataService.get(`/api/attendance/records?${params}`);
            if (!res.success) throw new Error(res.message || '加载失败');
            const records = (res.data || []).filter(record => {
                if (record.name !== person.name) return false;
                const late = ['Late', 'SeriousLate'].includes(record.on_duty_result);
                const early = record.off_duty_result === 'Early';
                const grace = record.on_duty_result === 'GraceLate';
                const flexible = showFlexibleLate && record.flexible_late === true;
                return kind === 'late' ? late : kind === 'early' ? early : kind === 'grace' ? grace : kind === 'flexible' ? flexible : late || early || grace || flexible;
            });
            if (id === detailRequestId.current) setDetail({ openId: id, person, kind, records, loading: false, error: '' });
        } catch (error) {
            if (id === detailRequestId.current) setDetail({ openId: id, person, kind, records: [], loading: false, error: error.message });
        }
    };
    const closeDetails = () => { detailRequestId.current++; closeCalendar(); setDetail(null); };
    return (
        <div className="space-y-3">
            <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-wrap items-center gap-2">
                {[
                    ['yesterday', '昨日'], ['week', '本周'], ['lastWeek', '上周'], ['month', '本月'], ['other', '其他月份']
                ].map(([value, label]) => (
                    <button key={value} onClick={() => setPeriod(value)} className={`px-3 py-1.5 rounded-md text-xs font-medium ${period === value ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{label}</button>
                ))}
                {period === 'other' && <input type="month" value={month} onChange={event => { if (event.target.value) setMonth(event.target.value); }} className="px-2 py-1 border border-slate-200 rounded-lg text-xs" />}
                <span className="text-xs text-slate-500">{range.start} ～ {range.end}</span>
            </div>
            <p className="text-xs text-slate-500">显示迟到、早退、迟到（免）{showFlexibleLate ? '及弹性10分钟' : ''}人员。免扣及弹性记录不处罚；弹性10分钟仅在月份统计中显示。点击整行或次数查看明细。</p>
            <SummaryPanel
                tableOnly showLateAllowances showFlexibleLate={showFlexibleLate} summaryView="table" loading={loading} summary={rows}
                summaryPage={page} setSummaryPage={setPage}
                summaryDeptFilter={dept} setSummaryDeptFilter={setDept}
                nameFilter={name} setNameFilter={setName} departmentGroups={departmentGroups}
                loadSummary={load} onOpenDetails={openDetails}
            />
            {detail && createPortal(
                <div className="pro3-attendance">
                    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40" onClick={closeDetails}>
                        <div role="dialog" aria-modal="true" aria-label="异常考勤详情" className="bg-white rounded-xl shadow-2xl w-full mx-4 overflow-hidden flex" style={{ maxWidth: calendarDocked ? 1100 : 750, height: calendarDocked ? 'min(640px, 85vh)' : undefined, maxHeight: '85vh' }} onClick={event => event.stopPropagation()}>
                            <div className="flex flex-col min-w-0 min-h-0" style={{ width: calendarDocked ? '40%' : '100%' }}>
                            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                                <div>
                                    <span className="text-sm font-bold text-slate-800">{detail.person.name} · {({ late: '迟到', early: '早退', grace: '迟到（免）', flexible: '弹性10分钟' })[detail.kind] || '异常'}详情</span>
                                    <p className="text-xs text-slate-500 mt-1">{detail.person.dept_name} · {range.start} ～ {range.end}</p>
                                </div>
                                <button onClick={closeDetails} className="text-sm text-slate-500 px-3 py-1">关闭</button>
                            </div>
                            <div className="p-4 overflow-y-auto">
                                {detail.loading ? <p className="text-center py-12 text-sm text-slate-400">加载中...</p> : detail.error ? <p className="text-center py-12 text-sm text-red-500">{detail.error}</p> : detail.records.length === 0 ? <p className="text-center py-12 text-sm text-slate-400">所选日期内暂无异常明细</p> : (
                                    <div className="space-y-3">
                                        {detail.records.map(record => (
                                            <div key={record.id} className="border border-slate-200 rounded-lg p-3">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-sm font-semibold text-slate-700">{record.work_date}</span>
                                                    <button className="text-xs text-primary hover:underline" onClick={() => openCalendar(detail.person.name, detail.person.dept_name, record.work_date.slice(0, 7), calendarTarget.current)}>查看个人考勤</button>
                                                </div>
                                                <div className="text-xs text-slate-600 space-y-1">
                                                    <p>上班打卡：{record.on_duty_time || '—'}{record.planned_start_time && `（应到 ${record.planned_start_time}）`}{['Late', 'SeriousLate'].includes(record.on_duty_result) && <span className="text-amber-600 ml-2">{record.on_duty_result === 'SeriousLate' ? '严重迟到' : '迟到'} {record.late_minutes || 0} 分钟</span>}</p>
                                                    <p>下班打卡：{record.off_duty_time || '—'}{record.planned_end_time && `（应离 ${record.planned_end_time}）`}{record.off_duty_result === 'Early' && <span className="text-orange-600 ml-2">早退 {record.early_leave_minutes || 0} 分钟</span>}</p>
                                                    {record.on_duty_result === 'GraceLate' && <p className="text-green-600">迟到（免）：{record.late_minutes}分钟，使用每月前3次免扣机会</p>}
                                                    {showFlexibleLate && record.flexible_late && <p className="text-primary">弹性10分钟：晚到{record.flexible_late_minutes}分钟，按正常考勤，不占用3次免扣机会</p>}
                                                    {record.remark && <p>备注：{record.remark}{record.verified_by ? '（已核实）' : '（待核实）'}</p>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            </div>
                            <div ref={calendarTarget} className="border-l border-slate-200 min-w-0" style={{ display: calendarDocked ? 'block' : 'none', width: '60%', height: '100%' }} />
                        </div>
                    </div>
                </div>, document.body
            )}
        </div>
    );
}
