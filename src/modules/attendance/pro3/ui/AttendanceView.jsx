"use client";
// src/views/AttendanceView.jsx
// Version: V9.5.0 - 考勤数据管理（钉钉考勤同步）- 重构拆分子组件
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Clock, RefreshCw, Search, Users, CheckCircle, XCircle, ChevronLeft, ChevronRight, Shield } from 'lucide-react';
import { DataService } from './services';


import toast from './Toast';
import { confirm } from './ConfirmDialog';
import { getDateRange } from './dateUtils';
import { Button, IconButton, SegmentedControl } from './components';

// 子组件
import RecordsPanel from './attendance/RecordsPanel';
import SummaryPanel from './attendance/SummaryPanel';
import AbnormalPanel from './attendance/AbnormalPanel';
import SyncPanel from './attendance/SyncPanel';
import ApprovalsPanel from './attendance/ApprovalsPanel';
import { APPROVAL_TYPE_MAP, getResultBadge, COMMON_PAGE_SIZE } from './attendance/attendanceConstants';


const attendancePortal = (children, target) => createPortal(<div className="pro3-attendance">{children}</div>, target);

export default function AttendanceView({ user, permissions }) {
    const isManager = permissions.includes('remark');
    const canManageAttendance = permissions.includes('remark');
    const canSyncAttendance = permissions.includes('sync');

    // 状态
    const [tab, setTab] = useState('summary'); // records/approvals 共用打卡与审批板块
    const [records, setRecords] = useState([]);
    const [summary, setSummary] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [departmentGroups, setDepartmentGroups] = useState([]);
    const [summaryDeptFilter, setSummaryDeptFilter] = useState('');
    const [syncLogs, setSyncLogs] = useState([]);
    const [approvals, setApprovals] = useState([]);
    const [approvalPagination, setApprovalPagination] = useState({ total: 0, page: 1, page_size: 25, total_pages: 0 });
    const [approvalTypeFilter, setApprovalTypeFilter] = useState('');
    const [approvalStatusFilter, setApprovalStatusFilter] = useState('');
    const [recordApprovals, setRecordApprovals] = useState([]);
    const [remarkModal, setRemarkModal] = useState(null);
    const [remarkText, setRemarkText] = useState('');
    const [calendarModal, setCalendarModal] = useState(null);
    const [calendarMonth, setCalendarMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
    const [calendarData, setCalendarData] = useState(null);
    const [calendarLoading, setCalendarLoading] = useState(false);
    const [calendarDay, setCalendarDay] = useState(null);
    const [targetWorkSettings, setTargetWorkSettings] = useState(null);
    const [savingWorkSettings, setSavingWorkSettings] = useState(false);
    const [summaryView, setSummaryView] = useState('matrix');
    const [summaryPage, setSummaryPage] = useState(1);
    const [matrixData, setMatrixData] = useState(null);
    const [matrixMonth, setMatrixMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
    const [staffHolidays, setStaffHolidays] = useState(0);
    const [matrixLoading, setMatrixLoading] = useState(false);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [pagination, setPagination] = useState({ total: 0, page: 1, page_size: 25, total_pages: 0 });
    const [sortKey, setSortKey] = useState('work_date');
    const [sortDir, setSortDir] = useState('desc');

    // 筛选
    const [dateRange, setDateRange] = useState(() => getDateRange('thisWeek'));
    const [deptFilter, setDeptFilter] = useState('');
    const [nameFilter, setNameFilter] = useState('');
    const [syncDate, setSyncDate] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() - 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const [syncRange, setSyncRange] = useState({ start: '', end: '' });

    const [syncPage, setSyncPage] = useState(1);

    // 主播日历弹窗
    const [anchorCalModal, setAnchorCalModal] = useState(null);
    const [anchorCalMonth, setAnchorCalMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
    const [anchorCalData, setAnchorCalData] = useState(null);
    const [anchorCalLoading, setAnchorCalLoading] = useState(false);
    const [anchorCalDay, setAnchorCalDay] = useState(null);
    const [anchorNoteText, setAnchorNoteText] = useState('');

    // 标记审核
    const [reviewList, setReviewList] = useState([]);
    const [reviewLoading, setReviewLoading] = useState(false);
    const [reviewRejectModal, setReviewRejectModal] = useState(null);
    const [reviewRejectReason, setReviewRejectReason] = useState('');

    // 加载部门列表
    useEffect(() => {
        DataService.get('/api/attendance/departments').then(res => {
            if (res.success) setDepartments(res.data);
        }).catch(() => {});
        DataService.get('/api/attendance/department-groups').then(res => {
            if (res.success) setDepartmentGroups(res.data);
        }).catch(() => {});
    }, []);

    // 排序切换
    const toggleSort = (key) => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('asc'); }
    };
    // 排序后的 records
    const sortedRecords = useMemo(() => {
        if (!records.length) return records;
        return [...records].sort((a, b) => {
            let va = a[sortKey] || '', vb = b[sortKey] || '';
            if (sortKey === 'work_date' || sortKey === 'on_duty_time' || sortKey === 'off_duty_time') {
                // 字符串比较（日期和时间都可以按字典序排）
            } else {
                va = va.toString().toLowerCase();
                vb = vb.toString().toLowerCase();
            }
            if (va < vb) return sortDir === 'asc' ? -1 : 1;
            if (va > vb) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
    }, [records, sortKey, sortDir]);

    // 加载考勤记录（同时联查该日期范围的已通过审批）
    const loadRecords = useCallback(async (page = 1) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                start_date: dateRange.start,
                end_date: dateRange.end,
                page: String(page),
                page_size: '25'
            });
            if (deptFilter) params.set('dept_name', deptFilter);
            if (nameFilter) params.set('name', nameFilter);

            const [res, appRes] = await Promise.all([
                DataService.get(`/api/attendance/records?${params}`),
                permissions.includes('approval') ? DataService.get(`/api/attendance/approvals/by-range?start_date=${dateRange.start}&end_date=${dateRange.end}`) : Promise.resolve({success:true, data:[]})
            ]);
            if (res.success) {
                setRecords(res.data);
                setPagination(res.pagination);
            }
            if (appRes.success) {
                setRecordApprovals(appRes.data || []);
            }
        } catch (e) {
            toast.error('加载失败: ' + e.message);
        }
        setLoading(false);
    }, [dateRange, deptFilter, nameFilter]);

    // 查找某人某天是否有匹配的已通过审批
    const findApprovalForRecord = useCallback((name, workDate) => {
        if (!recordApprovals.length) return null;
        return recordApprovals.find(a => {
            if (a.originator_name !== name) return false;
            const startDay = (a.start_time || '').slice(0, 10);
            const endDay = (a.end_time || '').slice(0, 10);
            return workDate >= startDay && workDate <= (endDay || startDay);
        }) || null;
    }, [recordApprovals]);

    // 加载汇总
    const loadSummary = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                start_date: dateRange.start,
                end_date: dateRange.end
            });
            if (summaryDeptFilter) params.set('dept_id', summaryDeptFilter);
            if (nameFilter) params.set('name', nameFilter);
            const res = await DataService.get(`/api/attendance/summary?${params}`);
            if (res.success) setSummary(res.data);
        } catch (e) {
            toast.error('加载失败: ' + e.message);
        }
        setLoading(false);
    }, [dateRange, summaryDeptFilter, nameFilter]);

    // 加载审批记录
    const loadApprovals = useCallback(async (page = 1) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                start_date: dateRange.start,
                end_date: dateRange.end,
                page: String(page),
                page_size: '25'
            });
            if (deptFilter) params.set('dept_name', deptFilter);
            if (nameFilter) params.set('name', nameFilter);
            if (approvalTypeFilter) params.set('approval_type', approvalTypeFilter);
            if (approvalStatusFilter) params.set('status', approvalStatusFilter);

            const res = await DataService.get(`/api/attendance/approvals?${params}`);
            if (res.success) {
                setApprovals(res.data);
                setApprovalPagination(res.pagination);
            }
        } catch (e) {
            toast.error('加载审批数据失败: ' + e.message);
        }
        setLoading(false);
    }, [dateRange, deptFilter, nameFilter, approvalTypeFilter, approvalStatusFilter]);

    // 加载同步日志
    const loadSyncLogs = useCallback(async () => {
        setSyncPage(1);
        try {
            const res = await DataService.get('/api/attendance/sync-log');
            if (res.success) setSyncLogs(res.data);
        } catch (e) {}
    }, []);

    // 加载矩阵数据
    const loadMatrix = useCallback(async (m) => {
        const month = m || matrixMonth;
        setMatrixLoading(true);
        try {
            const params = new URLSearchParams({ month });
            if (summaryDeptFilter) params.set('dept_id', summaryDeptFilter);
            if (nameFilter) params.set('name', nameFilter);
            const res = await DataService.get(`/api/attendance/matrix?${params}`);
            if (res.success) setMatrixData(res.data);
        } catch (e) { toast.error('加载矩阵失败'); }
        setMatrixLoading(false);
    }, [matrixMonth, summaryDeptFilter, nameFilter]);

    // 加载标记审核列表
    const loadReviews = useCallback(async () => {
        setReviewLoading(true);
        try {
            const res = await DataService.get('/api/anchor-dashboard/pending-reviews');
            if (res.success) setReviewList(res.data || []);
        } catch (e) {
            toast.error('加载审核列表失败');
        }
        setReviewLoading(false);
    }, []);

    // 审核操作
    const handleReview = async (id, action, reason) => {
        try {
            const res = await DataService.post('/api/anchor-dashboard/review-status', {
                id, action, reject_reason: reason || ''
            });
            if (res.success) {
                toast.success(res.msg);
                loadReviews();
                if (action === 'reject') {
                    setReviewRejectModal(null);
                    setReviewRejectReason('');
                }
            } else {
                toast.error(res.msg || '操作失败');
            }
        } catch (e) {
            toast.error('操作失败');
        }
    };

    // Tab 切换时加载数据
    useEffect(() => {
        if (tab === 'records') loadRecords();
        else if (tab === 'summary') {
            if (summaryView === 'matrix') loadMatrix();
            else loadSummary();
        }
        else if (tab === 'approvals') loadApprovals();
        else if (tab === 'sync') loadSyncLogs();
        else if (tab === 'review') loadReviews();
    }, [tab, loadRecords, loadSummary, loadApprovals, loadSyncLogs, loadMatrix, summaryView, loadReviews]);

    // 单日同步（考勤+审批）
    const handleSync = async () => {
        if (!syncDate) return;
        const ok = await confirm.warning(`确定同步 ${syncDate} 的考勤和审批数据？`, '同步确认');
        if (!ok) return;

        setSyncing(true);
        try {
            const res = await DataService.post('/api/attendance/sync', { work_date: syncDate });
            if (res.success) toast.success(res.message);
            else toast.error(res.message);
            const res2 = await DataService.post('/api/attendance/sync-approvals', { start_date: syncDate, end_date: syncDate });
            if (res2.success) toast.success('审批: ' + res2.message);
            loadSyncLogs();
            if (tab === 'records') loadRecords();
        } catch (e) {
            toast.error('同步失败: ' + e.message);
        }
        setSyncing(false);
    };

    // 批量同步（考勤+审批一起）
    const handleSyncRange = async () => {
        if (!syncRange.start || !syncRange.end) {
            toast.warning('请选择日期范围');
            return;
        }
        const ok = await confirm.warning(`确定批量同步 ${syncRange.start} ~ ${syncRange.end} 的考勤和审批数据？`, '同步确认');
        if (!ok) return;

        setSyncing(true);
        try {
            const res = await DataService.post('/api/attendance/sync-range', { start_date: syncRange.start, end_date: syncRange.end });
            if (res.success) toast.success('考勤: ' + res.message);
            else toast.error(res.message);
            const res2 = await DataService.post('/api/attendance/sync-approvals', { start_date: syncRange.start, end_date: syncRange.end });
            if (res2.success) toast.success('审批: ' + res2.message);
            loadSyncLogs();
        } catch (e) {
            toast.error('批量同步失败: ' + e.message);
        }
        setSyncing(false);
    };

    // 打开个人日历弹窗
    const closeCalendar = useCallback(() => {
        setCalendarModal(null);
        setCalendarData(null);
        setCalendarDay(null);
    }, []);
    const openCalendar = useCallback(async (name, dept_name, overrideMonth, dockTarget) => {
        const month = overrideMonth || calendarMonth;
        if (overrideMonth) setCalendarMonth(overrideMonth);
        setCalendarModal(previous => ({ name, dept_name, dockTarget: dockTarget || (previous?.name === name ? previous.dockTarget : null) }));
        setCalendarDay(null);
        setCalendarLoading(true);
        setTargetWorkSettings(null);
        try {
            const res = await DataService.get(`/api/attendance/calendar?name=${encodeURIComponent(name)}&month=${month}`);
            if (res.success) setCalendarData(res.data);
        } catch (e) { toast.error('加载失败'); }
        setCalendarLoading(false);
        if (canManageAttendance) {
            try {
                const sRes = await DataService.get(`/api/user/work-settings/${encodeURIComponent(name)}`);
                if (sRes.success) setTargetWorkSettings(sRes.data);
            } catch (e) {}
        }
    }, [calendarMonth, canManageAttendance]);

    // 切换日历月份
    const changeCalendarMonth = useCallback(async (offset) => {
        const [y, m] = calendarMonth.split('-').map(Number);
        const d = new Date(y, m - 1 + offset, 1);
        const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        setCalendarMonth(newMonth);
        if (!calendarModal) return;
        setCalendarLoading(true);
        setCalendarDay(null);
        try {
            const res = await DataService.get(`/api/attendance/calendar?name=${encodeURIComponent(calendarModal.name)}&month=${newMonth}`);
            if (res.success) setCalendarData(res.data);
        } catch (e) { toast.error('加载失败'); }
        setCalendarLoading(false);
    }, [calendarMonth, calendarModal]);

    // === 主播日历弹窗方法 ===
    const openAnchorCal = useCallback(async (name, overrideMonth) => {
        const month = overrideMonth || anchorCalMonth;
        if (overrideMonth) setAnchorCalMonth(overrideMonth);
        setAnchorCalModal({ name });
        setAnchorCalDay(null);
        setAnchorCalLoading(true);
        try {
            const res = await DataService.get(`/api/attendance/anchor-calendar?name=${encodeURIComponent(name)}&month=${month}`);
            if (res.success) setAnchorCalData(res.data);
        } catch (e) { toast.error('加载失败'); }
        setAnchorCalLoading(false);
    }, [anchorCalMonth]);

    const changeAnchorCalMonth = useCallback(async (offset) => {
        const [y, m] = anchorCalMonth.split('-').map(Number);
        const d = new Date(y, m - 1 + offset, 1);
        const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        setAnchorCalMonth(newMonth);
        if (!anchorCalModal) return;
        setAnchorCalLoading(true);
        setAnchorCalDay(null);
        try {
            const res = await DataService.get(`/api/attendance/anchor-calendar?name=${encodeURIComponent(anchorCalModal.name)}&month=${newMonth}`);
            if (res.success) setAnchorCalData(res.data);
        } catch (e) { toast.error('加载失败'); }
        setAnchorCalLoading(false);
    }, [anchorCalMonth, anchorCalModal]);

    const handleAnchorNote = async (noteType, content) => {
        if (!anchorCalModal || !anchorCalDay) return;
        try {
            const res = await DataService.post('/api/attendance/anchor-note', {
                anchor_name: anchorCalModal.name,
                note_date: anchorCalDay.date,
                note_type: noteType,
                content: content || ''
            });
            if (res.success) {
                toast.success(noteType === 'cannot_stream' ? '已标记无法开播' : '备注已保存');
                openAnchorCal(anchorCalModal.name, anchorCalMonth);
            } else {
                toast.error(res.message);
            }
        } catch (e) { toast.error('操作失败'); }
    };

    // 统一标记（走 anchor_daily_status，与工作台一致）
    const handleAnchorStatus = async (status) => {
        if (!anchorCalModal || !anchorCalDay) return;
        try {
            const res = await DataService.post('/api/anchor-dashboard/my-status', {
                target_anchor_name: anchorCalModal.name,
                date: anchorCalDay.date,
                status,
                remark: ''
            });
            if (res.success) {
                const labels = { normal: '正常开播', cannot_stream: '无法开播', training: '培训', rest: '休息' };
                toast.success(`已标记为${labels[status] || status}`);
                openAnchorCal(anchorCalModal.name, anchorCalMonth);
            } else {
                toast.error(res.message || '标记失败');
            }
        } catch (e) { toast.error('操作失败'); }
    };

    const deleteAnchorNote = async (noteId) => {
        try {
            const res = await DataService.delete(`/api/attendance/anchor-note/${noteId}`);
            if (res.success) {
                toast.success('已删除');
                openAnchorCal(anchorCalModal.name, anchorCalMonth);
            }
        } catch (e) { toast.error('删除失败'); }
    };

    // 打开备注弹窗
    const openRemarkModal = (record) => {
        setRemarkModal({ id: record.id, name: record.name, work_date: record.work_date });
        setRemarkText(record.remark || '');
    };

    // 提交备注
    const handleSubmitRemark = async () => {
        if (!remarkText.trim()) { toast.warning('请填写备注内容'); return; }
        try {
            const res = await DataService.post('/api/attendance/remark', { record_id: remarkModal.id, remark: remarkText });
            if (res.success) {
                toast.success('备注已添加');
                setRemarkModal(null);
                if (tab === 'records') loadRecords(pagination.page);
                if (calendarModal) openCalendar(calendarModal.name, calendarModal.dept_name);
            } else {
                toast.error(res.message);
            }
        } catch (e) {
            toast.error('备注失败: ' + e.message);
        }
    };

    // 核实备注
    const handleVerify = async (recordId) => {
        try {
            const res = await DataService.post('/api/attendance/verify', { record_id: recordId });
            if (res.success) {
                toast.success('已核实');
                loadRecords(pagination.page);
            } else {
                toast.error(res.message);
            }
        } catch (e) {
            toast.error('核实失败: ' + e.message);
        }
    };

    // 快捷日期
    const quickDates = [
        { label: '今天', value: 'today' },
        { label: '昨天', value: 'yesterday' },
        { label: '本周', value: 'thisWeek' },
        { label: '本月', value: 'thisMonth' },
        { label: '上月', value: 'lastMonth' },
    ];

    return (
        <div className="w-full">
            {/* Tab 切换 */}
            <div className="flex items-center gap-1 mb-4 bg-slate-100 p-1 rounded-lg w-fit">
                {[
                    { id: 'summary', label: '考勤汇总' },
                    { id: 'abnormal', label: '异常统计' },
                    { id: 'records', label: '打卡与审批' },
                    ...(canSyncAttendance ? [{ id: 'sync', label: '数据同步' }] : [])
                ].map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            (tab === t.id || (t.id === 'records' && tab === 'approvals')) ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {(tab === 'records' || tab === 'approvals') && (
                <div className="mb-4">
                    <SegmentedControl
                        size="sm"
                        value={tab}
                        onChange={setTab}
                        options={[
                            { value: 'records', label: '打卡明细' },
                            ...(permissions.includes('approval') ? [{ value: 'approvals', label: '审批记录' }] : []),
                        ]}
                    />
                </div>
            )}

            {/* 筛选栏（打卡明细 & 考勤汇总共用） */}
            {tab !== 'sync' && tab !== 'approvals' && tab !== 'abnormal' && tab !== 'review' && (
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

                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                            className="px-2 py-1 border border-slate-200 rounded text-xs outline-none focus:border-primary"
                        />
                        <span className="text-xs text-slate-400">~</span>
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                            className="px-2 py-1 border border-slate-200 rounded text-xs outline-none focus:border-primary"
                        />

                        <div className="w-px h-5 bg-slate-200 mx-1" />

                        <select
                            value={tab === 'summary' ? summaryDeptFilter : deptFilter}
                            onChange={e => tab === 'summary' ? setSummaryDeptFilter(e.target.value) : setDeptFilter(e.target.value)}
                            className="px-2 py-1 border border-slate-200 rounded text-xs outline-none focus:border-primary bg-white"
                        >
                            <option value="">全部部门</option>
                            {tab === 'summary'
                                ? departmentGroups.map(d => <option key={d.id} value={d.id}>{d.name}</option>)
                                : departments.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>

                        {tab === 'records' && (
                            <div className="relative">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300" />
                                <input
                                    value={nameFilter}
                                    onChange={e => setNameFilter(e.target.value)}
                                    placeholder="搜索姓名"
                                    className="pl-6 pr-2 py-1 border border-slate-200 rounded text-xs outline-none focus:border-primary w-28"
                                />
                            </div>
                        )}

                        <Button size="sm" variant="primary" icon={Search} onClick={() => tab === 'records' ? loadRecords() : tab === 'summary' ? (summaryView === 'matrix' ? loadMatrix() : loadSummary()) : loadApprovals()}>查询</Button>
                    </div>
                </div>
            )}

            {/* 审批记录 Tab */}
            {tab === 'approvals' && (
                <ApprovalsPanel
                    loading={loading}
                    approvals={approvals}
                    approvalPagination={approvalPagination}
                    loadApprovals={loadApprovals}
                    dateRange={dateRange}
                    setDateRange={setDateRange}
                    deptFilter={deptFilter}
                    setDeptFilter={setDeptFilter}
                    nameFilter={nameFilter}
                    setNameFilter={setNameFilter}
                    approvalTypeFilter={approvalTypeFilter}
                    setApprovalTypeFilter={setApprovalTypeFilter}
                    approvalStatusFilter={approvalStatusFilter}
                    setApprovalStatusFilter={setApprovalStatusFilter}
                    departments={departments}
                />
            )}

            {/* 打卡明细 Tab */}
            {tab === 'records' && (
                <RecordsPanel
                    loading={loading}
                    records={records}
                    sortedRecords={sortedRecords}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    toggleSort={toggleSort}
                    pagination={pagination}
                    loadRecords={loadRecords}
                    findApprovalForRecord={findApprovalForRecord}
                    openRemarkModal={openRemarkModal}
                    handleVerify={handleVerify}
                    isManager={isManager}
                />
            )}

            {/* 考勤汇总 Tab */}
            {tab === 'summary' && (
                <SummaryPanel
                    loading={loading}
                    summary={summary}
                    summaryView={summaryView}
                    setSummaryView={setSummaryView}
                    summaryPage={summaryPage}
                    setSummaryPage={setSummaryPage}
                    matrixData={matrixData}
                    matrixMonth={matrixMonth}
                    setMatrixMonth={setMatrixMonth}
                    matrixLoading={matrixLoading}
                    loadMatrix={loadMatrix}
                    loadSummary={loadSummary}
                    summaryDeptFilter={summaryDeptFilter}
                    setSummaryDeptFilter={setSummaryDeptFilter}
                    nameFilter={nameFilter}
                    setNameFilter={setNameFilter}
                    departmentGroups={departmentGroups}
                    staffHolidays={staffHolidays}
                    setStaffHolidays={setStaffHolidays}
                    canManageAttendance={permissions.includes('export')}
                    openCalendar={openCalendar}
                />
            )}

            {/* 数据同步 Tab（管理员） */}
            {tab === 'sync' && canSyncAttendance && (
                <SyncPanel
                    syncing={syncing}
                    syncDate={syncDate}
                    setSyncDate={setSyncDate}
                    handleSync={handleSync}
                    canSyncAttendance={canSyncAttendance}
                    syncRange={syncRange}
                    setSyncRange={setSyncRange}
                    handleSyncRange={handleSyncRange}
                    syncLogs={syncLogs}
                    loadSyncLogs={loadSyncLogs}
                    syncPage={syncPage}
                    setSyncPage={setSyncPage}
                />
            )}

            {tab === 'abnormal' && (
                <AbnormalPanel departmentGroups={departmentGroups} openCalendar={openCalendar} closeCalendar={closeCalendar} calendarDocked={Boolean(calendarModal?.dockTarget)} />
            )}

            {/* 主播月度日历弹窗 */}
            {anchorCalModal && attendancePortal(
                <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40" onClick={() => { setAnchorCalModal(null); setAnchorCalData(null); setAnchorCalDay(null); }}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-[750px] max-h-[90vh] mx-4 overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                        {/* 头部 */}
                        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/50">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-800">{anchorCalModal.name}</span>
                                <span className="text-xs-plus text-slate-400">主播</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <IconButton icon={ChevronLeft} variant="ghost" size="sm" onClick={() => changeAnchorCalMonth(-1)} title="上个月" />
                                <span className="text-sm font-medium text-slate-700 min-w-[80px] text-center">{anchorCalMonth}</span>
                                <IconButton icon={ChevronRight} variant="ghost" size="sm" onClick={() => changeAnchorCalMonth(1)} title="下个月" />
                                <IconButton icon={XCircle} variant="ghost" size="sm" onClick={() => { setAnchorCalModal(null); setAnchorCalData(null); setAnchorCalDay(null); }} title="关闭" className="ml-2" />
                            </div>
                        </div>

                        {/* 日历主体 */}
                        <div className="p-4 overflow-y-auto">
                            {anchorCalLoading ? (
                                <div className="text-center py-12 text-sm text-slate-400">加载中...</div>
                            ) : anchorCalData ? (() => {
                                const [year, mon] = anchorCalMonth.split('-').map(Number);
                                const firstDay = new Date(year, mon - 1, 1).getDay();
                                const daysInMonth = new Date(year, mon, 0).getDate();
                                const startOffset = firstDay === 0 ? 6 : firstDay - 1;

                                const { restDay, liveData, notes, statusMarks: rawStatusMarks, isFishAnchor } = anchorCalData;
                                const noteMap = {};
                                for (const n of (notes || [])) {
                                    if (!noteMap[n.note_date]) noteMap[n.note_date] = [];
                                    noteMap[n.note_date].push(n);
                                }
                                const statusMarkMap = {};
                                for (const m of (rawStatusMarks || [])) {
                                    statusMarkMap[m.date] = m;
                                }

                                let statLive = 0, statRest = 0, statNoStream = 0, statTraining = 0, statNote = 0;
                                const markStyles = {
                                    training: { label: '培训', color: 'bg-blue-100 text-blue-700' },
                                    cannot_stream: { label: '无法开播', color: 'bg-red-100 text-red-700' },
                                    rest: { label: '休息', color: 'bg-slate-100 text-slate-600' },
                                };

                                const cells = [];
                                for (let i = 0; i < startOffset; i++) cells.push(<div key={`e${i}`} />);
                                for (let day = 1; day <= daysInMonth; day++) {
                                    const ds = `${anchorCalMonth}-${String(day).padStart(2, '0')}`;
                                    const live = liveData[ds];
                                    const dayNotes = noteMap[ds] || [];
                                    const dayMark = statusMarkMap[ds];
                                    const hasRemark = dayNotes.some(n => n.note_type === 'remark');
                                    const isToday = ds === new Date().toISOString().slice(0, 10);
                                    const isFuture = ds > new Date().toISOString().slice(0, 10);

                                    const dow = new Date(year, mon - 1, day).getDay();
                                    const dowStr = dow === 0 ? '7' : String(dow);
                                    const isRestDay = restDay !== '0' && dowStr === restDay;

                                    let label = '', color = 'bg-slate-50 text-slate-300';

                                    const approvedMark = dayMark && dayMark.status !== 'normal' ? dayMark : null;
                                    if (approvedMark && markStyles[approvedMark.status]) {
                                        label = markStyles[approvedMark.status].label;
                                        color = markStyles[approvedMark.status].color;
                                        if (approvedMark.status === 'rest') statRest++;
                                        else if (approvedMark.status === 'training') statTraining++;
                                        else if (approvedMark.status === 'cannot_stream') statNoStream++;
                                    } else if (isRestDay) {
                                        label = '休'; color = 'bg-amber-50 text-amber-500'; statRest++;
                                    } else if (live && live.hours > 0) {
                                        const h = Math.round(live.hours * 10) / 10;
                                        label = `${h}h`;
                                        if (live.hours >= 5) color = 'bg-green-100 text-green-700';
                                        else if (live.hours >= 3) color = 'bg-green-50 text-green-600';
                                        else if (live.hours >= 1) color = 'bg-amber-50 text-amber-600';
                                        else color = 'bg-red-50 text-red-500';
                                        statLive++;
                                    } else if (isFuture) {
                                        label = '—';
                                    } else if (isFishAnchor && !live) {
                                        label = '休'; color = 'bg-amber-50 text-amber-500'; statRest++;
                                    } else {
                                        label = '—';
                                    }

                                    if (hasRemark && !approvedMark) {
                                        label += '*'; statNote++;
                                    }

                                    cells.push(
                                        <div
                                            key={day}
                                            onClick={() => setAnchorCalDay({ date: ds, live, notes: dayNotes, isRestDay })}
                                            className={`relative rounded-lg p-1 text-center cursor-pointer transition-all hover:ring-2 hover:ring-blue-300 ${color} ${isToday ? 'ring-2 ring-blue-400' : ''} ${anchorCalDay?.date === ds ? 'ring-2 ring-blue-600' : ''}`}
                                        >
                                            <div className={`text-xs-plus font-medium ${!live && !isRestDay && !approvedMark ? 'text-slate-300' : ''}`}>{day}</div>
                                            <div className="text-2xs font-medium leading-tight truncate">{label}</div>
                                        </div>
                                    );
                                }

                                return (
                                    <>
                                        <div className="grid grid-cols-7 gap-1 mb-1">
                                            {['一','二','三','四','五','六','日'].map(d => (
                                                <div key={d} className="text-center text-2xs font-semibold text-slate-400 py-1">{d}</div>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-7 gap-1">
                                            {cells}
                                        </div>
                                        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100 flex-wrap">
                                            <span className="text-xs-plus text-green-600">直播 {statLive}天</span>
                                            <span className="text-xs-plus text-amber-500">休息 {statRest}天</span>
                                            <span className="text-xs-plus text-red-500">无法开播 {statNoStream}天</span>
                                            {statTraining > 0 && <span className="text-xs-plus text-primary">培训 {statTraining}天</span>}
                                            {statNote > 0 && <span className="text-xs-plus text-indigo-500">有备注 {statNote}天</span>}
                                        </div>
                                        {anchorCalDay && (
                                            <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                                                <div className="text-xs font-semibold text-slate-700 mb-2">{anchorCalDay.date} 详情</div>
                                                {anchorCalDay.isRestDay && <div className="text-xs-plus text-amber-600 mb-1">本日为休息日</div>}
                                                {anchorCalDay.live && anchorCalDay.live.hours > 0 && (
                                                    <div className="text-xs-plus text-slate-600 mb-1">
                                                        直播 {Math.round(anchorCalDay.live.hours * 10) / 10}h
                                                        {anchorCalDay.live.products?.length > 0 && <span className="text-slate-400 ml-1">({anchorCalDay.live.products.join(', ')})</span>}
                                                    </div>
                                                )}
                                                {anchorCalDay.live?.details?.length > 1 && (
                                                    <div className="text-xs-plus text-slate-500 mb-1 ml-2">
                                                        {anchorCalDay.live.details.map((d, i) => <div key={i}>{d.product}: {Math.round(d.hours * 10) / 10}h</div>)}
                                                    </div>
                                                )}
                                                {anchorCalDay.notes?.length > 0 && (
                                                    <div className="mt-1.5 space-y-1">
                                                        {anchorCalDay.notes.map((n, i) => (
                                                            <div key={i} className="flex items-center gap-2 text-xs-plus">
                                                                <span className={`px-1.5 py-0.5 rounded text-2xs font-medium ${n.note_type === 'cannot_stream' ? 'text-red-600 bg-red-50' : n.note_type === 'training' ? 'text-primary bg-blue-50' : 'text-indigo-600 bg-indigo-50'}`}>
                                                                    {n.note_type === 'cannot_stream' ? '无法开播' : n.note_type === 'training' ? '培训' : '备注'}
                                                                </span>
                                                                {n.content && <span className="text-slate-600">{n.content}</span>}
                                                                <span className="text-slate-400">— {n.created_by}</span>
                                                                <Button variant="ghost" size="sm" onClick={() => deleteAnchorNote(n.id)} className="!text-2xs !text-red-400 hover:!text-red-600 !p-0">删除</Button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                <div className="mt-2 pt-2 border-t border-slate-200 space-y-2">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <Button variant="ghost" size="sm" onClick={() => handleAnchorStatus('normal')} className="!text-2xs !bg-green-50 !text-green-600 hover:!bg-green-100">正常开播</Button>
                                                        <Button variant="ghost" size="sm" onClick={() => handleAnchorStatus('cannot_stream')} className="!text-2xs !bg-red-50 !text-red-600 hover:!bg-red-100">无法开播</Button>
                                                        <Button variant="ghost" size="sm" onClick={() => handleAnchorStatus('training')} className="!text-2xs !bg-blue-50 !text-primary hover:!bg-blue-100">培训</Button>
                                                        <Button variant="ghost" size="sm" onClick={() => handleAnchorStatus('rest')} className="!text-2xs !bg-amber-50 !text-amber-600 hover:!bg-amber-100">休息</Button>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            type="text"
                                                            value={anchorNoteText}
                                                            onChange={e => setAnchorNoteText(e.target.value)}
                                                            placeholder="添加备注..."
                                                            className="flex-1 text-xs-plus px-2 py-1 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-300"
                                                            onKeyDown={e => { if (e.key === 'Enter' && anchorNoteText.trim()) { handleAnchorNote('remark', anchorNoteText.trim()); setAnchorNoteText(''); } }}
                                                        />
                                                        <Button variant="ghost" size="sm" onClick={() => { if (anchorNoteText.trim()) { handleAnchorNote('remark', anchorNoteText.trim()); setAnchorNoteText(''); } }} className="!text-2xs !bg-blue-50 !text-primary hover:!bg-blue-100">保存</Button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                );
                            })() : null}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ==================== 标记审核 Tab ==================== */}
            {tab === 'review' && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                            <Shield className="w-4 h-4 text-purple-500" />
                            主播状态标记审核
                        </h3>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={loadReviews}
                            className="!text-xs !text-primary hover:!text-primary-hover"
                        >
                            <RefreshCw className={`w-3 h-3 ${reviewLoading ? 'animate-spin' : ''}`} />
                            刷新
                        </Button>
                    </div>

                    {reviewLoading ? (
                        <div className="p-8 text-center text-sm text-slate-400">加载中...</div>
                    ) : reviewList.length === 0 ? (
                        <div className="p-8 text-center text-sm text-slate-400">
                            <CheckCircle className="w-8 h-8 text-green-300 mx-auto mb-2" />
                            暂无待审核的标记
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">主播</th>
                                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">日期</th>
                                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">状态标记</th>
                                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">标记人</th>
                                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">备注</th>
                                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">提交时间</th>
                                        <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500">操作</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {reviewList.map(item => {
                                        const statusOpt = [
                                            { value: 'normal', label: '正常开播', color: 'text-green-600 bg-green-50' },
                                            { value: 'training', label: '培训', color: 'text-primary bg-blue-50' },
                                            { value: 'leave', label: '请假', color: 'text-amber-600 bg-amber-50' },
                                            { value: 'rest', label: '休息', color: 'text-slate-600 bg-slate-50' },
                                        ].find(s => s.value === item.status) || { label: item.status, color: 'text-slate-600 bg-slate-50' };

                                        return (
                                            <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-slate-800 text-xs">{item.user_name}</div>
                                                    {item.project && <div className="text-2xs text-slate-400">{item.project}</div>}
                                                </td>
                                                <td className="px-4 py-3 text-xs text-slate-600 font-mono">{item.date}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`text-xs-plus px-2 py-0.5 rounded-full font-medium ${statusOpt.color}`}>
                                                        {statusOpt.label}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="text-xs text-slate-600">{item.marked_by}</div>
                                                    <div className="text-2xs text-slate-400">
                                                        {item.approver_role === 'operator' ? '→ 运营审核' : '→ 负责人审核'}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-xs text-slate-500 max-w-[150px] truncate">{item.remark || '—'}</td>
                                                <td className="px-4 py-3 text-2xs text-slate-400">{(item.updated_at || '').replace('T', ' ').slice(0, 16)}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <Button variant="ghost" size="sm" onClick={() => handleReview(item.id, 'approve')} className="!bg-green-50 !text-green-600 hover:!bg-green-100">通过</Button>
                                                        <Button variant="ghost" size="sm" onClick={() => { setReviewRejectModal(item); setReviewRejectReason(''); }} className="!bg-red-50 !text-red-600 hover:!bg-red-100">拒绝</Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* 拒绝原因弹窗 */}
            {reviewRejectModal && attendancePortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={() => setReviewRejectModal(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5" onClick={e => e.stopPropagation()}>
                        <h3 className="text-sm font-semibold text-slate-800 mb-3">
                            拒绝标记 — {reviewRejectModal.user_name} {reviewRejectModal.date}
                        </h3>
                        <textarea
                            value={reviewRejectReason}
                            onChange={e => setReviewRejectReason(e.target.value)}
                            placeholder="请填写拒绝原因（可选）"
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-primary resize-none"
                            rows={3}
                            autoFocus
                        />
                        <div className="flex justify-end gap-2 mt-3">
                            <Button variant="secondary" size="sm" onClick={() => setReviewRejectModal(null)}>取消</Button>
                            <Button variant="danger" size="sm" onClick={() => handleReview(reviewRejectModal.id, 'reject', reviewRejectReason)}>
                                确认拒绝
                            </Button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* 个人月度日历弹窗 */}
            {calendarModal && attendancePortal(
                <div className={calendarModal.dockTarget ? 'h-full flex flex-col min-h-0' : 'fixed inset-0 z-[9998] flex items-center justify-center bg-black/40'} onClick={calendarModal.dockTarget ? undefined : closeCalendar}>
                    <div className={calendarModal.dockTarget ? 'bg-white w-full h-full overflow-hidden flex flex-col min-h-0' : 'bg-white rounded-xl shadow-2xl w-full max-w-[750px] max-h-[90vh] mx-4 overflow-hidden flex flex-col'} onClick={e => e.stopPropagation()}>
                        {/* 头部 */}
                        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/50">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-800">{calendarModal.name}</span>
                                <span className="text-xs-plus text-slate-400">{calendarModal.dept_name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <IconButton icon={ChevronLeft} variant="ghost" size="sm" onClick={() => changeCalendarMonth(-1)} title="上个月" />
                                <span className="text-sm font-medium text-slate-700 min-w-[80px] text-center">{calendarMonth}</span>
                                <IconButton icon={ChevronRight} variant="ghost" size="sm" onClick={() => changeCalendarMonth(1)} title="下个月" />
                                <IconButton icon={XCircle} variant="ghost" size="sm" onClick={closeCalendar} title="关闭" className="ml-2" />
                            </div>
                        </div>

                        {/* 日历主体 */}
                        <div className="p-4 overflow-y-auto">
                            {calendarLoading ? (
                                <div className="text-center py-12 text-sm text-slate-400">加载中...</div>
                            ) : calendarData ? (() => {
                                const [year, mon] = calendarMonth.split('-').map(Number);
                                const firstDay = new Date(year, mon - 1, 1).getDay();
                                const daysInMonth = new Date(year, mon, 0).getDate();
                                const startOffset = firstDay === 0 ? 6 : firstDay - 1;

                                const dayMap = {};
                                const rosterDayMap = {};
                                for (const day of calendarData.roster || []) rosterDayMap[day.work_date] = day;
                                for (const r of calendarData.records) {
                                    dayMap[r.work_date] = r;
                                }
                                const approvalDayMap = {};
                                for (const a of calendarData.approvals) {
                                    const startDay = (a.start_time || '').slice(0, 10);
                                    const endDay = (a.end_time || '').slice(0, 10);
                                    const sd = new Date(startDay); const ed = new Date(endDay || startDay);
                                    for (let d = new Date(sd); d <= ed; d.setDate(d.getDate() + 1)) {
                                        const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                                        if (!approvalDayMap[ds]) approvalDayMap[ds] = [];
                                        approvalDayMap[ds].push(a);
                                    }
                                }

                                let statNormal = 0, statLate = 0, statEarly = 0, statMissing = 0, statLeave = 0, statOut = 0, statRepair = 0, statRemark = 0;

                                const cells = [];
                                for (let i = 0; i < startOffset; i++) cells.push(<div key={`e${i}`} />);
                                for (let day = 1; day <= daysInMonth; day++) {
                                    const ds = `${calendarMonth}-${String(day).padStart(2, '0')}`;
                                    const rec = dayMap[ds];
                                    const apps = approvalDayMap[ds] || [];
                                    const isWeekend = new Date(year, mon - 1, day).getDay() % 6 === 0;
                                    const isToday = ds === new Date().toISOString().slice(0, 10);

                                    let status = 'none';
                                    let label = '';
                                    let color = 'bg-slate-50 text-slate-300';
                                    let lateLabel = '';
                                    let isGraceLate = false;

                                    if (rosterDayMap[ds]?.status === 'rest') {
                                        status = 'rest'; label = '休'; color = 'bg-slate-100 text-slate-500';
                                    } else if (!rec && !apps.length) {
                                        if (!rosterDayMap[ds] && isWeekend) { label = '休'; color = 'bg-slate-50 text-slate-300'; }
                                        else { label = '—'; }
                                    } else if (apps.length > 0) {
                                        const a = apps[0];
                                        if (a.approval_type === 'leave') {
                                            status = 'leave'; label = a.leave_type || '请假'; color = 'bg-purple-50 text-purple-600'; statLeave++;
                                        } else if (a.approval_type === 'go_out' || a.approval_type === 'business_trip') {
                                            status = 'goout'; label = a.approval_type === 'go_out' ? '外出' : '出差'; color = 'bg-cyan-50 text-cyan-600'; statOut++;
                                        } else if (a.approval_type === 'repair_check') {
                                            status = 'repair'; label = '补卡'; color = 'bg-blue-50 text-primary'; statRepair++;
                                        } else if (a.approval_type === 'overtime') {
                                            status = 'normal'; label = '加班'; color = 'bg-amber-50 text-amber-600';
                                        }
                                        if (rec && rec.on_duty_result === 'Normal' && rec.off_duty_result === 'Normal' && status !== 'leave') {
                                            if (status === 'repair') { label = '正常'; color = 'bg-green-50 text-green-600'; }
                                        }
                                    }
                                    if (rec && status === 'none') {
                                        const abnormal = ['NotSigned', 'Absenteeism', 'Late', 'SeriousLate', 'Early'];
                                        const isOnBad = abnormal.includes(rec.on_duty_result);
                                        const isOffBad = abnormal.includes(rec.off_duty_result);
                                        isGraceLate = rec.on_duty_result === 'GraceLate';
                                        const lateMins = rec.late_minutes || 0;
                                        lateLabel = lateMins > 0 ? (lateMins >= 60 ? `${Math.floor(lateMins/60)}h${lateMins%60 ? lateMins%60+'m' : ''}` : `${lateMins}m`) : '';
                                        if (isGraceLate && !isOffBad) {
                                            status = 'normal'; label = '迟'; color = 'bg-green-50 text-green-600'; statNormal++;
                                        } else if (!isOnBad && !isOffBad && !isGraceLate) {
                                            status = 'normal'; label = '正常'; color = 'bg-green-50 text-green-600'; statNormal++;
                                        } else if (rec.on_duty_result === 'SeriousLate') {
                                            status = 'late'; label = '迟到'; color = 'bg-red-50 text-red-600'; statLate++;
                                        } else if (rec.on_duty_result === 'Late') {
                                            status = 'late'; label = '迟到'; color = 'bg-amber-50 text-amber-600'; statLate++;
                                        } else if (rec.off_duty_result === 'Early') {
                                            status = 'early'; label = '早退'; color = 'bg-orange-50 text-orange-600'; statEarly++;
                                        } else {
                                            status = 'missing'; label = '缺卡'; color = 'bg-red-50 text-red-500'; statMissing++;
                                        }
                                        if (rec.remark && (isOnBad || isOffBad)) {
                                            if (rec.verified_by) { label = '已说明'; color = 'bg-teal-50 text-teal-600'; statRemark++; statMissing = Math.max(0, statMissing - 1); }
                                            else { label += '*'; }
                                        }
                                    }

                                    cells.push(
                                        <div
                                            key={day}
                                            onClick={() => (rec || apps.length) && setCalendarDay({ date: ds, record: rec, approvals: apps })}
                                            className={`relative rounded-lg p-1 text-center cursor-pointer transition-all hover:ring-2 hover:ring-blue-300 ${color} ${isToday ? 'ring-2 ring-blue-400' : ''} ${calendarDay?.date === ds ? 'ring-2 ring-blue-600' : ''}`}
                                        >
                                            <div className={`text-xs-plus font-medium ${isWeekend && status === 'none' ? 'text-slate-300' : ''}`}>{day}</div>
                                            <div className="text-2xs font-medium leading-tight truncate">{label}</div>
                                            {lateLabel && (status === 'late' || isGraceLate) && <div className="text-3xs opacity-70 leading-none">{lateLabel}</div>}
                                        </div>
                                    );
                                }

                                return (
                                    <>
                                        <div className="grid grid-cols-7 gap-1 mb-1">
                                            {['一','二','三','四','五','六','日'].map(d => (
                                                <div key={d} className="text-center text-2xs font-semibold text-slate-400 py-1">{d}</div>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-7 gap-1">
                                            {cells}
                                        </div>
                                        {calendarData.roster?.length > 0 && <p className="mt-2 text-xs text-slate-500">休息日按 {calendarMonth} 排班表：{calendarData.roster.filter(day => day.status === 'rest').map(day => Number(day.work_date.slice(8))).join('、') || '无'} 日</p>}
                                        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100 flex-wrap">
                                            <span className="text-xs-plus text-green-600">正常 {statNormal}</span>
                                            <span className="text-xs-plus text-amber-600">迟到 {statLate}</span>
                                            <span className="text-xs-plus text-orange-600">早退 {statEarly}</span>
                                            <span className="text-xs-plus text-red-500">缺卡 {statMissing}</span>
                                            <span className="text-xs-plus text-purple-600">请假 {statLeave}</span>
                                            <span className="text-xs-plus text-cyan-600">外出 {statOut}</span>
                                            <span className="text-xs-plus text-primary">补卡 {statRepair}</span>
                                            {statRemark > 0 && <span className="text-xs-plus text-teal-600">已说明 {statRemark}</span>}
                                        </div>
                                        {calendarDay && (
                                            <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-xs font-semibold text-slate-700">{calendarDay.date} 详情</span>
                                                </div>
                                                {calendarDay.record && (
                                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs-plus">
                                                        <div>上班: <span className="text-green-600 font-mono">{calendarDay.record.on_duty_time || '—'}</span> {calendarDay.record.on_duty_result && getResultBadge(calendarDay.record.on_duty_result)}</div>
                                                        <div>下班: <span className="text-primary font-mono">{calendarDay.record.off_duty_time || '—'}</span> {calendarDay.record.off_duty_result && getResultBadge(calendarDay.record.off_duty_result)}</div>
                                                    </div>
                                                )}
                                                {calendarDay.approvals.length > 0 && (
                                                    <div className="mt-1.5 space-y-1">
                                                        {calendarDay.approvals.map((a, i) => {
                                                            const t = APPROVAL_TYPE_MAP[a.approval_type] || { label: a.approval_type, color: 'text-purple-600 bg-purple-50' };
                                                            return (
                                                                <div key={i} className="text-xs-plus text-slate-600">
                                                                    <span className={`inline-block px-1.5 py-0.5 rounded text-2xs font-medium ${t.color}`}>{t.label}</span>
                                                                    {a.leave_type && <span className="ml-1 text-slate-500">({a.leave_type})</span>}
                                                                    {a.reason && <span className="ml-1 text-slate-400">{a.reason}</span>}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                                {calendarDay.record && (
                                                    <div className="mt-2 pt-2 border-t border-slate-200">
                                                        {calendarDay.record.remark ? (
                                                            <div className="flex items-center gap-2">
                                                                <span className={`text-xs-plus ${calendarDay.record.verified_by ? 'text-green-600' : 'text-amber-600'}`}>
                                                                    {calendarDay.record.verified_by ? '✓ ' : ''}{calendarDay.record.remark}
                                                                </span>
                                                                <span className="text-2xs text-slate-400">— {calendarDay.record.remark_by}</span>
                                                                {isManager && !calendarDay.record.verified_by && (
                                                                    <Button variant="ghost" size="sm" onClick={async () => { await handleVerify(calendarDay.record.id); openCalendar(calendarModal.name, calendarModal.dept_name); }} className="!text-2xs !px-1.5 !py-0.5 !bg-green-50 !text-green-600 hover:!bg-green-100">核实</Button>
                                                                )}
                                                            </div>
                                                        ) : (() => {
                                                            const rec = calendarDay.record;
                                                            const abnormal = ['NotSigned', 'Absenteeism', 'Late', 'SeriousLate', 'Early'];
                                                            const hasAbnormal = abnormal.includes(rec.on_duty_result) || abnormal.includes(rec.off_duty_result);
                                                            return hasAbnormal ? (
                                                                <Button variant="ghost" size="sm" onClick={() => openRemarkModal(calendarDay.record)} className="!text-2xs !bg-blue-50 !text-primary hover:!bg-blue-100">添加备注说明</Button>
                                                            ) : null;
                                                        })()}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {canManageAttendance && targetWorkSettings && (
                                            <div className="mt-3 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-xs font-semibold text-slate-700">考勤设置</span>
                                                </div>
                                                <div className="flex items-center gap-3 flex-wrap">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-xs-plus text-slate-500">休息日</span>
                                                        <select
                                                            value={calendarData.roster?.length ? '0' : targetWorkSettings.rest_day || '0'}
                                                            disabled={calendarData.roster?.length > 0}
                                                            onChange={e => setTargetWorkSettings({...targetWorkSettings, rest_day: e.target.value})}
                                                            className="px-1.5 py-0.5 border border-slate-200 rounded text-xs-plus outline-none focus:border-primary"
                                                        >
                                                            <option value="0">{calendarData.roster?.length ? '按排班表' : '无'}</option>
                                                            <option value="1">周一</option>
                                                            <option value="2">周二</option>
                                                            <option value="3">周三</option>
                                                            <option value="4">周四</option>
                                                            <option value="5">周五</option>
                                                            <option value="6">周六</option>
                                                            <option value="7">周日</option>
                                                        </select>
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-xs-plus text-slate-500">上班</span>
                                                        <select
                                                            value={targetWorkSettings.work_start_time || ''}
                                                            onChange={e => setTargetWorkSettings({...targetWorkSettings, work_start_time: e.target.value})}
                                                            className="px-1.5 py-0.5 border border-slate-200 rounded text-xs-plus outline-none focus:border-primary"
                                                        >
                                                            <option value="">钉钉默认（{targetWorkSettings.dingtalk_start_time || '待同步'}）</option>
                                                            {Array.from({length: 36}, (_, i) => { const h = Math.floor(i/2)+6; const m = i%2*30; const t = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; return <option key={t} value={t}>{t}</option>; })}
                                                        </select>
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-xs-plus text-slate-500">下班</span>
                                                        <select
                                                            value={targetWorkSettings.work_end_time || ''}
                                                            onChange={e => setTargetWorkSettings({...targetWorkSettings, work_end_time: e.target.value})}
                                                            className="px-1.5 py-0.5 border border-slate-200 rounded text-xs-plus outline-none focus:border-primary"
                                                        >
                                                            <option value="">钉钉默认（{targetWorkSettings.dingtalk_end_time || '待同步'}）</option>
                                                            {Array.from({length: 36}, (_, i) => { const h = Math.floor(i/2)+6; const m = i%2*30; const t = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; return <option key={t} value={t}>{t}</option>; })}
                                                        </select>
                                                    </div>
                                                    <Button
                                                        variant="primary"
                                                        size="sm"
                                                        onClick={async () => {
                                                            setSavingWorkSettings(true);
                                                            try {
                                                                const res = await DataService.put(`/api/user/work-settings/${encodeURIComponent(calendarModal.name)}`, targetWorkSettings);
                                                                if (res.success) {
                                                                    toast.success(`已保存 ${calendarModal.name} 的考勤设置`);
                                                                    const cRes = await DataService.get(`/api/attendance/calendar?name=${encodeURIComponent(calendarModal.name)}&month=${calendarMonth}`);
                                                                    if (cRes.success) setCalendarData(cRes.data);
                                                                    setCalendarDay(null);
                                                                } else toast.error(res.message || '保存失败');
                                                            } catch (e) { toast.error('保存失败'); }
                                                            setSavingWorkSettings(false);
                                                        }}
                                                        disabled={savingWorkSettings}
                                                        loading={savingWorkSettings}
                                                    >
                                                        {savingWorkSettings ? '保存中...' : '保存'}
                                                    </Button>
                                                </div>
                                                <p className="mt-2 text-xs-plus text-slate-500">
                                                    默认跟随钉钉当天班次；手动选择时间会覆盖钉钉设置。
                                                    {targetWorkSettings.dingtalk_schedule_date
                                                        ? ` 当前显示 ${targetWorkSettings.dingtalk_schedule_date} 同步的班次时间。`
                                                        : ' 请先同步考勤以获取班次时间。'}
                                                </p>
                                            </div>
                                        )}
                                    </>
                                );
                            })() : null}
                        </div>
                    </div>
                </div>,
                calendarModal.dockTarget || document.body
            )}

            {/* 备注弹窗 */}
            {remarkModal && attendancePortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={() => setRemarkModal(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-5" onClick={e => e.stopPropagation()}>
                        <h3 className="text-sm font-semibold text-slate-800 mb-3">
                            添加备注 — {remarkModal.name} {remarkModal.work_date}
                        </h3>
                        <textarea
                            value={remarkText}
                            onChange={e => setRemarkText(e.target.value)}
                            placeholder="请说明异常原因，如：陪老板外出用餐、临时外勤等"
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-primary resize-none"
                            rows={3}
                            autoFocus
                        />
                        <div className="flex justify-end gap-2 mt-3">
                            <Button variant="secondary" size="sm" onClick={() => setRemarkModal(null)}>取消</Button>
                            <Button size="sm" onClick={handleSubmitRemark}>提交备注</Button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
