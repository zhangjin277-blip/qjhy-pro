"use client";
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, CalendarCheck, CheckCircle2 } from 'lucide-react';
import { Button } from '../components';
import { DataService } from '../services';
import toast from '../Toast';

export default function RosterSyncPanel({ canSyncAttendance }) {
    const [month, setMonth] = useState(() => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7));
    const [syncing, setSyncing] = useState(false);
    const [logs, setLogs] = useState([]);
    const loadStatus = useCallback(async () => {
        try {
            const result = await DataService.get(`/api/attendance/sync-roster-status?month=${month}`);
            setLogs(result.data || []);
        } catch (error) { toast.error(error.message); }
    }, [month]);
    useEffect(() => { loadStatus(); }, [loadStatus]);
    const sync = async () => {
        setSyncing(true);
        try {
            const result = await DataService.post('/api/attendance/sync-roster', { month });
            toast.success(result.message);
        } catch (error) { toast.error(error.message); }
        finally { setSyncing(false); await loadStatus(); }
    };
    const latestSuccess = logs.find(log => log.success);
    return (
        <div className="attendance-sync-card">
            <div className="attendance-sync-heading">
                <span className="attendance-sync-icon"><CalendarCheck size={18} /></span>
                <h3>表格休息同步</h3>
                <span className="attendance-sync-badge">每天 09:01</span>
            </div>
            <p className="attendance-sync-description">读取钉钉排班表，更新所选月份的休息安排。</p>
            <div className="attendance-sync-fields">
                <label>排班月份<input type="month" value={month} disabled={syncing} onChange={event => { if (event.target.value) setMonth(event.target.value); }} /></label>
            </div>
            <div className="attendance-sync-action">
                <Button size="sm" variant="primary" icon={RefreshCw} onClick={sync} loading={syncing} disabled={syncing || !canSyncAttendance} title={!canSyncAttendance ? '无操作权限' : ''}>{syncing ? '同步中...' : '同步表格休息'}</Button>
            </div>
            {latestSuccess && <div className="attendance-sync-status">
                <div><CheckCircle2 size={14} /><strong>最近同步成功</strong><span>{latestSuccess.people} 人 · {latestSuccess.rest_days} 个休息人日</span></div>
                <p>{new Date(latestSuccess.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</p>
            </div>}
            {logs[0]?.success === false && <p className="attendance-sync-error">最近同步失败：{logs[0].message}；保留上次成功的排班。</p>}
            <p className="attendance-sync-note">表格休息调整后可手动同步；改为上班会取消原休息标记。</p>
        </div>
    );
}
