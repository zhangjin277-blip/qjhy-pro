// server/routes/attendance.routes.js
// Version: V9.5.0 - 钉钉考勤数据同步与查询

import { createRouter, passThrough, dbAll, dbGet, dbRun, getNow, scopedNames } from './runtime';
import * as dingtalkService from './dingtalk';
import ExcelJS from 'exceljs';
import { getDepartmentGroups, getUserDepartmentLabels, appendDepartmentFilter } from './departments';
import { readDingtalkWorkSchedule } from './work-schedule';
import { syncRoster, getRosterDays, indexRoster, ROSTER_NODE } from './roster';

export default function(db) {
    const router = createRouter();
    const authenticateToken = passThrough;


    // 考勤超级权限：admin 或 is_attendance_admin
    const requireAttendanceAdmin = passThrough;
    const isAttendanceAdmin = user => user.allowedNames === null;

    // 主播不走打卡考勤，走直播时长统计（"直播统计"tab）。
    // 其他普通部门（包括一组、二组、创意组）仍需出现在考勤中，不能按部门名整组隐藏。
    const HIDDEN_DEPTS = [];

    // 获取主播部门下的所有人名（用于直播统计筛选）
    // 递归查找"主播"父部门及其所有子部门（麻将、捕鱼、斗地主、三国等）
    async function getAnchorNames() {
        try {
            // 1. 找到名称含"主播"的部门（父部门）
            const parentDepts = await dbAll(db, `SELECT dept_id FROM dingtalk_departments WHERE name LIKE '%主播%'`);
            if (parentDepts.length === 0) return [];

            // 2. 递归查找所有子部门
            const allDeptIds = new Set(parentDepts.map(d => String(d.dept_id)));
            const queue = [...allDeptIds];
            while (queue.length > 0) {
                const parentId = queue.shift();
                const children = await dbAll(db,
                    `SELECT dept_id FROM dingtalk_departments WHERE parent_id = ?`,
                    [parentId]
                );
                for (const child of children) {
                    const childId = String(child.dept_id);
                    if (!allDeptIds.has(childId)) {
                        allDeptIds.add(childId);
                        queue.push(childId);
                    }
                }
            }


            // 3. 找到这些部门下的人
            const allUsers = await dbAll(db, `SELECT name, dept_ids FROM dingtalk_users WHERE status = 1`);
            const names = [];
            for (const u of allUsers) {
                if (!u.dept_ids) continue;
                let ids = [];
                try {
                    ids = JSON.parse(u.dept_ids).map(String);
                } catch (e) {
                    ids = u.dept_ids.replace(/[\[\]"]/g, '').split(',').map(s => s.trim());
                }
                if (ids.some(id => allDeptIds.has(id))) {
                    names.push(u.name);
                }
            }
            return scopedNames(names);
        } catch (e) {
            console.warn('⚠️ 获取主播名单失败:', e.message);
            return [];
        }
    }

    // 权限过滤：根据用户实际配置的 scopes 过滤
    // 缓存主播名单（5分钟有效）
    async function getCachedAnchorNames() { return getAnchorNames(); }

    async function applyPermissionFilter(sql, params, user, nameField = 'name', deptField = 'dept_name') {
        // 屏蔽挂靠部门
        if (HIDDEN_DEPTS.length > 0) {
            sql += ` AND ${deptField} NOT IN (${HIDDEN_DEPTS.map(() => '?').join(',')})`;
            params.push(...HIDDEN_DEPTS);
        }
        // 屏蔽主播（从钉钉组织架构动态获取）
        const anchorNames = await getCachedAnchorNames();
        if (anchorNames.length > 0) {
            sql += ` AND ${nameField} NOT IN (${anchorNames.map(() => '?').join(',')})`;
            params.push(...anchorNames);
        }
        if (isAttendanceAdmin(user)) return { sql, params };
        const ids = user.allowedUserIds || [];
        const idField = nameField === 'originator_name' ? 'originator_userid' : 'dingtalk_userid';
        sql += ids.length ? ` AND ${idField} IN (${ids.map(() => '?').join(',')})` : ' AND 1=0';
        params.push(...ids);
        return { sql, params };
    }

    // ==========================================
    // 用户自定义工作时间 → 重新判定考勤结果
    // ==========================================
    // 缓存用户工作时间设置（挂在 db 上，auth.routes 保存时可清除）
    if (!db._workTimeCache) db._workTimeCache = { map: {}, expiresAt: 0 };
    async function getUserWorkTimeMap() {
        const workTimeCache = db._workTimeCache;
        if (Date.now() < workTimeCache.expiresAt) return workTimeCache.map;
        const rows = await dbAll(db,
            `SELECT name, rest_day, work_start_time, work_end_time FROM users WHERE (work_start_time != '' OR work_end_time != '' OR rest_day != '0') AND name IS NOT NULL`
        );
        const map = {};
        for (const r of rows) {
            if (r.name) map[r.name] = { rest_day: r.rest_day || '0', start: r.work_start_time || '', end: r.work_end_time || '' };
        }
        db._workTimeCache.map = map;
        db._workTimeCache.expiresAt = Date.now() + 5 * 60 * 1000;
        return map;
    }

    // 用用户自定义时间重新判定单条记录
    function reJudgeRecord(rec, userSetting) {
        if (!userSetting || !rec) return rec;
        const newRec = { ...rec };

        // 未打卡（NotSigned）不做重新判定，保持原状
        const isOnNotSigned = rec.on_duty_result === 'NotSigned';
        const isOffNotSigned = rec.off_duty_result === 'NotSigned';

        // 休息日：不判定迟到/早退，全部置为正常（但未打卡除外，保持缺卡状态）
        if (userSetting.rest_day && userSetting.rest_day !== '0' && rec.work_date) {
            const d = new Date(rec.work_date);
            const dow = d.getDay(); // 0=周日
            const dowStr = dow === 0 ? '7' : String(dow);
            if (dowStr === userSetting.rest_day) {
                newRec._isRestDay = true;
                newRec.on_duty_result = isOnNotSigned ? 'NotSigned' : 'Normal';
                newRec.off_duty_result = isOffNotSigned ? 'NotSigned' : (rec.off_duty_time ? 'Normal' : newRec.off_duty_result);
                newRec.late_minutes = 0;
                newRec.early_leave_minutes = 0;
                return newRec;
            }
        }

        // 重新判定上班（10分钟宽限期）— 未打卡跳过
        const GRACE_MINUTES = 10;
        if (userSetting.start && rec.on_duty_time && !isOnNotSigned) {
            const planStart = userSetting.start + ':00'; // HH:MM → HH:MM:00
            if (rec.on_duty_time <= planStart) {
                newRec.on_duty_result = 'Normal';
                newRec.late_minutes = 0;
            } else {
                const diffMins = calcTimeDiffMinutes(planStart, rec.on_duty_time);
                if (diffMins <= GRACE_MINUTES) {
                    // 宽限期内，不算迟到
                    newRec.flexible_late = true;
                    newRec.flexible_late_minutes = diffMins;
                    newRec.on_duty_result = 'Normal';
                    newRec.late_minutes = 0;
                } else {
                    newRec.on_duty_result = diffMins >= 120 ? 'SeriousLate' : 'Late';
                    newRec.late_minutes = diffMins;
                }
            }
        }

        // 下班未手动覆盖时，保持钉钉当天班次的判定，不根据上班时间推算。
        const effectiveEnd = userSetting.end;
        if (effectiveEnd && rec.off_duty_time && !isOffNotSigned) {
            const planEnd = effectiveEnd + ':00';
            if (rec.off_duty_time >= planEnd) {
                newRec.off_duty_result = 'Normal';
                newRec.early_leave_minutes = 0;
            } else {
                const diffMins = calcTimeDiffMinutes(rec.off_duty_time, planEnd);
                newRec.off_duty_result = 'Early';
                newRec.early_leave_minutes = diffMins;
            }
        }

        return newRec;
    }

    // 计算两个 HH:MM:SS 时间的分钟差
    function calcTimeDiffMinutes(t1, t2) {
        const toMin = t => {
            const parts = t.split(':').map(Number);
            return parts[0] * 60 + parts[1] + (parts[2] || 0) / 60;
        };
        return Math.max(0, Math.round(toMin(t2) - toMin(t1)));
    }

    // 批量重新判定记录：钉钉默认班次和手动班次共用弹性/免扣规则。
    const MONTHLY_GRACE_COUNT = 3;
    async function applyWorkTimeOverride(records) {
        if (!records.length) return records;
        const map = await getUserWorkTimeMap();
        const dates = records.map(r => r.work_date).filter(Boolean).sort();
        const start = dates[0].slice(0, 7) + '-01';
        const end = dates.at(-1).slice(0, 7) + '-31';
        const roster = indexRoster(await getRosterDays(db, start, end));
        const judge = r => {
            const schedule = readDingtalkWorkSchedule(r.raw_data);
            const withSchedule = { ...r, flexible_late: false, flexible_late_minutes: 0, planned_start_time: map[r.name]?.start || schedule.start, planned_end_time: map[r.name]?.end || schedule.end };
            const planned = roster(r);
            if (planned) {
                withSchedule.roster_status = planned.status;
                if (planned.status === 'rest') return { ...withSchedule, _isRestDay: true, on_duty_result: 'Rest', off_duty_result: 'Rest', late_minutes: 0, early_leave_minutes: 0 };
            }
            const setting = {
                rest_day: planned ? '0' : map[r.name]?.rest_day || '0',
                start: map[r.name]?.start || schedule.start,
                // 默认下班沿用钉钉结果；只在手动覆盖时重新判断，避免跨日班次误判。
                end: map[r.name]?.end || '',
            };
            const result = reJudgeRecord(withSchedule, setting);
            // 旧记录没有计划时间时，可用钉钉已记录的迟到分钟数应用10分钟弹性。
            if (!setting.start && result.on_duty_result === 'Late' && result.late_minutes > 0 && result.late_minutes <= 10) {
                result.flexible_late = true;
                result.flexible_late_minutes = result.late_minutes;
                result.on_duty_result = 'Normal';
                result.late_minutes = 0;
            }
            return result;
        };
        const judged = records.map(judge);
        const eligible = r => !r._isRestDay && r.on_duty_result === 'Late' && r.late_minutes > 10 && r.late_minutes <= 30;
        const names = [...new Set(judged.filter(eligible).map(r => r.name))];
        if (!names.length) return judged;

        // 必须从整个月的历史记录确定前3次，不能按当前页、昨日或本周重新计数。
        const history = await dbAll(db, `SELECT * FROM attendance_records
            WHERE work_date >= ? AND work_date <= ? AND name IN (${names.map(() => '?').join(',')})
            ORDER BY work_date, dingtalk_userid`, [start, end, ...names]);
        const counts = new Map(), graceRecords = new Set();
        const recordKey = r => `${r.dingtalk_userid || r.name}_${r.work_date}`;
        for (const raw of history) {
            const r = judge(raw);
            if (!eligible(r)) continue;
            const key = `${r.dingtalk_userid || r.name}_${r.work_date.slice(0, 7)}`;
            const count = (counts.get(key) || 0) + 1;
            counts.set(key, count);
            if (count <= MONTHLY_GRACE_COUNT) graceRecords.add(recordKey(r));
        }
        return judged.map(r => eligible(r) && graceRecords.has(recordKey(r)) ? { ...r, on_duty_result: 'GraceLate' } : r);
    }

    // ==========================================
    // 查询考勤数据（支持日期范围、部门、姓名筛选）
    // ==========================================
    router.get('/records', authenticateToken, async (req, res) => {
        try {
            const { start_date, end_date, dept_name, name, userid, page = 1, page_size = 25 } = req.query;

            let sql = 'SELECT * FROM attendance_records WHERE 1=1';
            const params = [];

            if (start_date) {
                sql += ' AND work_date >= ?';
                params.push(start_date);
            }
            if (end_date) {
                sql += ' AND work_date <= ?';
                params.push(end_date);
            }
            if (dept_name) {
                sql += ' AND dept_name = ?';
                params.push(dept_name);
            }
            if (name) {
                sql += ' AND name LIKE ?';
                params.push(`%${name}%`);
            }

            // 权限过滤
            if (userid) {
                sql += ' AND dingtalk_userid = ?';
                params.push(userid);
            }
            const pf = await applyPermissionFilter(sql, params, req.user);
            sql = pf.sql;

            // 统计总数
            const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
            const countRow = await dbGet(db, countSql, params);
            const total = countRow?.total || 0;

            // 分页
            const offset = (parseInt(page) - 1) * parseInt(page_size);
            sql += ' ORDER BY work_date DESC, name ASC LIMIT ? OFFSET ?';
            params.push(parseInt(page_size), offset);

            const rawRows = await dbAll(db, sql, params);
            const rows = await applyWorkTimeOverride(rawRows);

            res.json({
                success: true,
                data: rows,
                pagination: {
                    total,
                    page: parseInt(page),
                    page_size: parseInt(page_size),
                    total_pages: Math.ceil(total / parseInt(page_size))
                }
            });
        } catch (e) {
            console.error('❌ [考勤] 查询失败:', e.message);
            res.json({ success: false, message: e.message });
        }
    });

    // ==========================================
    // 考勤汇总统计（融合审批+备注数据）
    // ==========================================
    router.get('/summary', authenticateToken, async (req, res) => {
        try {
            const { start_date, end_date, dept_name, dept_id, name } = req.query;

            if (!start_date || !end_date) {
                return res.json({ success: false, message: '请提供日期范围' });
            }

            // 查原始记录（用于应用自定义工作时间后重新聚合）
            let sql = `SELECT name, dept_name, dingtalk_userid, on_duty_result, off_duty_result,
                        on_duty_time, off_duty_time, late_minutes, early_leave_minutes, work_date,
                        remark, verified_by, raw_data
                    FROM attendance_records WHERE work_date >= ? AND work_date <= ?`;
            const params = [start_date, end_date];

            if (dept_name) {
                sql += ' AND dept_name = ?';
                params.push(dept_name);
            }

            sql = appendDepartmentFilter(sql, params, dept_id);
            if (name) { sql += ' AND name LIKE ?'; params.push(`%${name}%`); }
            const pf2 = await applyPermissionFilter(sql, params, req.user);
            sql = pf2.sql;
            sql += ' ORDER BY dept_name, name, work_date';

            const rawRecords = await dbAll(db, sql, params);
            const records = await applyWorkTimeOverride(rawRecords);
            const departmentLabels = await getUserDepartmentLabels(db);

            // 在 JS 中按人聚合统计
            const peopleMap = {};
            for (const r of records) {
                const key = r.dingtalk_userid || r.name;
                if (!peopleMap[key]) {
                    peopleMap[key] = {
                        name: r.name, dept_name: departmentLabels.get(r.dingtalk_userid) || r.dept_name, dingtalk_userid: r.dingtalk_userid,
                        total_days: 0, normal_days: 0, late_days: 0, early_leave_days: 0,
                        grace_late_days: 0, flexible_late_days: 0,
                        missing_punch_days: 0, absent_days_count: 0, total_late_minutes: 0,
                        remark_days: 0, verified_days: 0
                    };
                }
                const p = peopleMap[key];
                if (r.roster_status === 'rest') continue;
                p.total_days++;
                if ((r.on_duty_result === 'Normal' || r.on_duty_result === 'GraceLate') && r.off_duty_result === 'Normal') p.normal_days++;
                if (r.on_duty_result === 'Late' || r.on_duty_result === 'SeriousLate') p.late_days++;
                if (r.on_duty_result === 'GraceLate') p.grace_late_days++;
                if (r.flexible_late) p.flexible_late_days++;
                if (r.off_duty_result === 'Early') p.early_leave_days++;
                if (r.on_duty_result === 'NotSigned' || r.off_duty_result === 'NotSigned') p.missing_punch_days++;
                if (r.on_duty_result === 'Absenteeism' || r.off_duty_result === 'Absenteeism') p.absent_days_count++;
                p.total_late_minutes += (r.late_minutes || 0);
                if (r.remark) p.remark_days++;
                if (r.verified_by) p.verified_days++;
            }
            const rows = Object.values(peopleMap);

            // 查询审批数据，按人员聚合
            const approvals = await dbAll(db, `
                SELECT originator_name, approval_type,
                       start_time, end_time, duration_hours
                FROM approval_instances
                WHERE status = 'COMPLETED' AND result = 'agree'
                  AND start_time <= ? AND (end_time >= ? OR end_time IS NULL)
            `, [end_date + ' 23:59:59', start_date]);

            const approvalMap = {};
            for (const a of approvals) {
                if (!approvalMap[a.originator_name]) {
                    approvalMap[a.originator_name] = { leave: 0, go_out: 0, business_trip: 0, overtime: 0, repair_check: 0 };
                }
                const m = approvalMap[a.originator_name];
                const hours = a.duration_hours || 0;
                const days = hours >= 8 ? Math.round(hours / 8 * 10) / 10 : (hours > 0 ? Math.round(hours / 8 * 10) / 10 : 1);
                if (a.approval_type === 'leave') m.leave += days;
                else if (a.approval_type === 'go_out') m.go_out += days;
                else if (a.approval_type === 'business_trip') m.business_trip += days;
                else if (a.approval_type === 'overtime') m.overtime += days;
                else if (a.approval_type === 'repair_check') m.repair_check += 1;
            }

            const enriched = rows.map(r => {
                const ap = approvalMap[r.name] || {};
                return {
                    ...r,
                    leave_days: Math.round((ap.leave || 0) * 10) / 10,
                    go_out_days: Math.round((ap.go_out || 0) * 10) / 10,
                    business_trip_days: Math.round((ap.business_trip || 0) * 10) / 10,
                    overtime_days: Math.round((ap.overtime || 0) * 10) / 10,
                    repair_check_count: ap.repair_check || 0,
                };
            });

            res.json({ success: true, data: enriched });
        } catch (e) {
            console.error('❌ [考勤] 汇总失败:', e.message);
            res.json({ success: false, message: e.message });
        }
    });

    // ==========================================
    // 个人月度日历数据（某人某月每天的考勤+审批+备注）
    // ==========================================
    router.get('/calendar', authenticateToken, async (req, res) => {
        try {
            const { name, month, user_id } = req.query; // month: YYYY-MM
            if ((!name && !user_id) || !month) {
                return res.json({ success: false, message: '缺少参数' });
            }

            const start_date = month + '-01';
            // 计算月末
            const [y, m] = month.split('-').map(Number);
            const lastDay = new Date(y, m, 0).getDate();
            const end_date = `${month}-${String(lastDay).padStart(2, '0')}`;

            // 考勤记录（应用自定义工作时间覆盖）
            const rawRecords = await dbAll(db, `
                SELECT id, name, dingtalk_userid, work_date, on_duty_time, off_duty_time, on_duty_result, off_duty_result,
                       late_minutes, early_leave_minutes, remark, remark_by, remark_at, verified_by, verified_at,
                       all_check_times, raw_data
                FROM attendance_records
                WHERE ${user_id ? 'dingtalk_userid' : 'name'} = ? AND work_date >= ? AND work_date <= ?
                ORDER BY work_date
            `, [user_id || name, start_date, end_date]);
            const records = await applyWorkTimeOverride(rawRecords);

            // 审批记录
            const approvals = await dbAll(db, `
                SELECT approval_type, start_time, end_time, duration_hours, leave_type, reason
                FROM approval_instances
                WHERE ${user_id ? 'originator_userid' : 'originator_name'} = ? AND status = 'COMPLETED' AND result = 'agree'
                  AND start_time <= ? AND (end_time >= ? OR end_time IS NULL)
            `, [user_id || name, end_date + ' 23:59:59', start_date]);

            const rosterRows = await getRosterDays(db, start_date, end_date, user_id ? undefined : name, user_id);
            const roster = new Set(rosterRows.map(row => row.dingtalk_userid)).size > 1 ? [] : rosterRows;
            res.json({ success: true, data: { records, approvals, roster, month, name } });
        } catch (e) {
            res.json({ success: false, message: e.message });
        }
    });

    // ==========================================
    // 全员月度矩阵（甘特图视图）
    // ==========================================
    // 获取团队列表（用于考勤筛选）
    router.get('/department-groups', authenticateToken, async (req, res) => {
        try {
            const groups = await getDepartmentGroups(db);
            const rows = req.user.allowedDeptIds === null ? groups : groups.filter(group => req.user.allowedDeptIds?.includes(group.id));
            res.json({ success: true, data: rows });
        } catch (e) {
            res.json({ success: false, message: e.message });
        }
    });

    router.get('/matrix', authenticateToken, async (req, res) => {
        try {
            const { month, dept_name, dept_id, name } = req.query;
            if (!month) return res.json({ success: false, message: '缺少月份参数' });

            const start_date = month + '-01';
            const [y, m] = month.split('-').map(Number);
            const lastDay = new Date(y, m, 0).getDate();
            const end_date = `${month}-${String(lastDay).padStart(2, '0')}`;

            // 部门显示采用当前钉钉架构和部门别名。
            const departmentLabels = await getUserDepartmentLabels(db);

            // 查全部考勤记录
            let recSql = `SELECT id, name, dingtalk_userid, dept_name, work_date, on_duty_time, off_duty_time,
                           on_duty_result, off_duty_result, remark, remark_by, verified_by,
                           late_minutes, early_leave_minutes, all_check_times, remark_at, verified_at, raw_data
                    FROM attendance_records WHERE work_date >= ? AND work_date <= ?`;
            const recParams = [start_date, end_date];
            if (dept_name) { recSql += ' AND dept_name = ?'; recParams.push(dept_name); }
            if (name) { recSql += ' AND name LIKE ?'; recParams.push(`%${name}%`); }
            recSql = appendDepartmentFilter(recSql, recParams, dept_id);
            // 权限过滤
            const pfm = await applyPermissionFilter(recSql, recParams, req.user);
            recSql = pfm.sql;
            recSql += ' ORDER BY dept_name, name, work_date';
            const rawRecords = await dbAll(db, recSql, recParams);
            const records = await applyWorkTimeOverride(rawRecords);

            // 查全部审批（含补卡——start_time可能为null，用leave_type里的时间匹配）
            const rosterForDay = indexRoster(await getRosterDays(db, start_date, end_date));
            const approvals = await dbAll(db, `
                SELECT approval_type, originator_name, start_time, end_time, duration_hours, leave_type, reason
                FROM approval_instances
                WHERE status = 'COMPLETED' AND result = 'agree'
                  AND (
                    (start_time IS NOT NULL AND start_time <= ? AND (end_time >= ? OR end_time IS NULL))
                    OR (approval_type = 'repair_check' AND leave_type >= ? AND leave_type <= ?)
                  )
            `, [end_date + ' 23:59:59', start_date, start_date, end_date + ' 23:59:59']);

            // 按人名+日期组织审批
            const approvalMap = {};
            for (const a of approvals) {
                // 补卡：用 leave_type 里的日期
                if (a.approval_type === 'repair_check') {
                    const dateStr = (a.leave_type || '').slice(0, 10);
                    if (dateStr && dateStr.length >= 10) {
                        const key = `${a.originator_name}_${dateStr}`;
                        if (!approvalMap[key]) approvalMap[key] = [];
                        approvalMap[key].push(a);
                    }
                    continue;
                }
                if (!a.start_time) continue;
                const sdStr = (a.start_time || '').slice(0, 10);
                const edStr = (a.end_time || a.start_time || '').slice(0, 10);
                if (!sdStr || sdStr.length < 10) continue;
                const sd = new Date(sdStr);
                const ed = new Date(edStr.length >= 10 ? edStr : sdStr);
                if (isNaN(sd.getTime()) || isNaN(ed.getTime())) continue;
                for (let d = new Date(sd); d <= ed; d.setDate(d.getDate() + 1)) {
                    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                    if (ds < start_date || ds > end_date) continue;
                    const key = `${a.originator_name}_${ds}`;
                    if (!approvalMap[key]) approvalMap[key] = [];
                    approvalMap[key].push(a);
                }
            }

            // 按人分组（附加团队信息）
            const peopleMap = new Map();
            for (const r of records) {
                if (!peopleMap.has(r.name)) {
                    peopleMap.set(r.name, { name: r.name, dept_name: r.dept_name, team_name: departmentLabels.get(r.dingtalk_userid) || r.dept_name || '', days: {} });
                }
                const p = peopleMap.get(r.name);
                p.days[r.work_date] = r;
            }
            // 补充只有审批没有考勤记录的人
            for (const a of approvals) {
                if (!peopleMap.has(a.originator_name) && (!dept_name || true)) {
                    // 只有审批没考勤的情况较少，先跳过
                }
            }

            // 生成矩阵数据
            const people = [];
            for (const [pname, pdata] of peopleMap) {
                if (name && !pname.includes(name)) continue;
                const row = { name: pname, dept_name: pdata.dept_name, team_name: pdata.team_name || '', days: {} };
                for (let day = 1; day <= lastDay; day++) {
                    const ds = `${month}-${String(day).padStart(2, '0')}`;
                    const rec = pdata.days[ds] || null;
                    const apps = approvalMap[`${pname}_${ds}`] || [];
                    const isWeekend = new Date(y, m - 1, day).getDay() % 6 === 0;
                    const planned = rosterForDay({ name: pname, work_date: ds, dingtalk_userid: rec?.dingtalk_userid });

                    let status = 'none';
                    let extra = null;
                    if (apps.length > 0) {
                        const a = apps[0];
                        if (a.approval_type === 'leave') { status = 'leave'; extra = a.leave_type; }
                        else if (a.approval_type === 'go_out') status = 'goout';
                        else if (a.approval_type === 'business_trip') status = 'trip';
                        else if (a.approval_type === 'repair_check') status = 'repair';
                        else if (a.approval_type === 'overtime') status = 'overtime';
                    }
                    if (rec && status === 'none') {
                        const abnormal = ['NotSigned', 'Absenteeism', 'Late', 'SeriousLate', 'Early'];
                        const onBad = abnormal.includes(rec.on_duty_result);
                        const offBad = abnormal.includes(rec.off_duty_result);
                        const isGraceLate = rec.on_duty_result === 'GraceLate';
                        if (isGraceLate && !offBad) status = 'normal';
                        else if (!onBad && !offBad && !isGraceLate) status = 'normal';
                        else if (rec.on_duty_result === 'Late' || rec.on_duty_result === 'SeriousLate') status = 'late';
                        else if (rec.off_duty_result === 'Early') status = 'early';
                        else status = 'missing';
                        if (rec.remark && rec.verified_by && (onBad || offBad)) {
                            status = 'verified';
                        }
                    }
                    if (planned?.status === 'rest') status = 'rest';
                    else if (!planned && !rec && !apps.length && isWeekend) status = 'rest';

                    const graceLate = rec && rec.on_duty_result === 'GraceLate' && status === 'normal';
                    const seriousLate = rec && rec.on_duty_result === 'SeriousLate' && status === 'late';
                    row.days[day] = { status, extra, hasRecord: !!rec, recordId: rec?.id, graceLate, seriousLate };
                }
                people.push(row);
            }

            res.json({ success: true, data: { people, month, lastDay } });
        } catch (e) {
            console.error('❌ [考勤] 矩阵查询失败:', e.message);
            res.json({ success: false, message: e.message });
        }
    });

    // ==========================================
    // 获取部门列表（从已同步数据中提取）
    // ==========================================
    router.get('/departments', authenticateToken, async (req, res) => {
        try {
            const hideClause = HIDDEN_DEPTS.length ? ` AND dept_name NOT IN (${HIDDEN_DEPTS.map(() => '?').join(',')})` : '';
            const rows = await dbAll(db, `SELECT DISTINCT dept_name FROM attendance_records WHERE dept_name IS NOT NULL AND dept_name != ''${hideClause} ORDER BY dept_name`, [...HIDDEN_DEPTS]);
            res.json({ success: true, data: rows.map(r => r.dept_name) });
        } catch (e) {
            res.json({ success: false, message: e.message });
        }
    });

    // ==========================================
    // 手动触发同步（仅管理员）
    // ==========================================
    router.post('/sync-roster', authenticateToken, requireAttendanceAdmin, async (req, res) => {
        try {
            const result = await syncRoster(db, req.body.month, req.user.username);
            res.json({ success: true, data: result, message: `${result.month}排班已更新：${result.people}人，${result.restDays}个休息人日` });
        } catch (error) { res.json({ success: false, message: error.message }); }
    });
    router.get('/sync-roster-status', authenticateToken, async (req, res) => {
        const month = req.query.month;
        const rows = await dbAll(db, 'SELECT * FROM attendance_roster_sync_log WHERE source_node=? AND month=? ORDER BY id DESC LIMIT 5', [ROSTER_NODE, month]);
        res.json({ success: true, data: rows });
    });
    router.post('/sync', authenticateToken, requireAttendanceAdmin, async (req, res) => {
        try {
            const { work_date } = req.body;
            if (!work_date) {
                return res.json({ success: false, message: '请提供同步日期' });
            }

            console.log(`📡 [考勤] 手动触发同步: ${work_date}，操作人: ${req.user.username}`);
            const result = await dingtalkService.syncAttendanceData(db, work_date);

            // 记录同步日志
            await dbRun(db, `
                INSERT INTO attendance_sync_log (sync_date, total, synced, failed, skipped, triggered_by)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [work_date, result.total, result.synced, result.failed, result.skipped, req.user.username]);

            res.json({
                success: true,
                message: `同步完成: ${result.synced}人成功, ${result.skipped}人跳过, ${result.failed}人失败`,
                data: result
            });
        } catch (e) {
            console.error('❌ [考勤] 同步失败:', e.message);
            res.json({ success: false, message: '同步失败: ' + e.message });
        }
    });

    // ==========================================
    // 批量同步（同步日期范围，仅管理员）
    // ==========================================
    router.post('/sync-range', authenticateToken, requireAttendanceAdmin, async (req, res) => {
        try {
            const { start_date, end_date } = req.body;
            if (!start_date || !end_date) {
                return res.json({ success: false, message: '请提供日期范围' });
            }

            // 计算日期列表
            const dates = [];
            const start = new Date(start_date);
            const end = new Date(end_date);
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                dates.push(ds);
            }

            if (dates.length > 31) {
                return res.json({ success: false, message: '单次最多同步31天' });
            }

            console.log(`📡 [考勤] 批量同步 ${dates.length} 天: ${start_date} ~ ${end_date}`);

            const results = [];
            for (let i = 0; i < dates.length; i++) {
                const date = dates[i];
                // 天与天之间间隔1秒，避免连续请求触发限流
                if (i > 0) await new Promise(r => setTimeout(r, 1000));
                try {
                    const result = await dingtalkService.syncAttendanceData(db, date);
                    results.push({ date, ...result });

                    await dbRun(db, `
                        INSERT INTO attendance_sync_log (sync_date, total, synced, failed, skipped, triggered_by)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `, [date, result.total, result.synced, result.failed, result.skipped, req.user.username]);
                } catch (e) {
                    results.push({ date, error: e.message });
                }
            }

            const totalSynced = results.reduce((s, r) => s + (r.synced || 0), 0);
            res.json({
                success: true,
                message: `批量同步完成，共 ${dates.length} 天，同步 ${totalSynced} 条记录`,
                data: results
            });
        } catch (e) {
            console.error('❌ [考勤] 批量同步失败:', e.message);
            res.json({ success: false, message: '批量同步失败: ' + e.message });
        }
    });

    // ==========================================
    // 同步日志
    // ==========================================
    router.get('/sync-log', authenticateToken, async (req, res) => {
        try {
            const rows = await dbAll(db, 'SELECT * FROM attendance_sync_log ORDER BY created_at DESC LIMIT 50');
            res.json({ success: true, data: rows });
        } catch (e) {
            res.json({ success: false, message: e.message });
        }
    });

    // ==========================================
    // 某人某日详细考勤（含原始数据）
    // ==========================================
    router.get('/detail', authenticateToken, async (req, res) => {
        try {
            const { userid, work_date } = req.query;
            if (!userid || !work_date) {
                return res.json({ success: false, message: '缺少参数' });
            }

            const row = await dbGet(db, 'SELECT * FROM attendance_records WHERE dingtalk_userid = ? AND work_date = ?', [userid, work_date]);
            if (!row) {
                return res.json({ success: false, message: '无记录' });
            }

            // 解析原始数据
            if (row.raw_data) {
                try { row.raw_data = JSON.parse(row.raw_data); } catch (e) {}
            }

            res.json({ success: true, data: row });
        } catch (e) {
            res.json({ success: false, message: e.message });
        }
    });

    // ==========================================
    // 添加备注（本人可对自己的考勤记录备注）
    // ==========================================
    router.post('/remark', authenticateToken, async (req, res) => {
        try {
            const { record_id, remark } = req.body;
            if (!record_id || !remark?.trim()) {
                return res.json({ success: false, message: '请填写备注内容' });
            }

            const record = await dbGet(db, 'SELECT * FROM attendance_records WHERE id = ?', [record_id]);
            if (!record) return res.json({ success: false, message: '记录不存在' });

            // 本人或管理员/团队负责人/考勤管理员可以备注
            const isOwner = record.name === req.user.display_name;
            const isManager = req.user.role === 'admin' || req.user.role === 'team_leader' || req.user.is_attendance_admin;
            if (!isOwner && !isManager) {
                return res.json({ success: false, message: '只能对自己的考勤记录添加备注' });
            }

            await dbRun(db, `
                UPDATE attendance_records SET remark = ?, remark_by = ?, remark_at = ? WHERE id = ?
            `, [remark.trim(), req.user.display_name || req.user.username, getNow(), record_id]);

            res.json({ success: true, message: '备注已添加' });
        } catch (e) {
            res.json({ success: false, message: e.message });
        }
    });

    // ==========================================
    // 核实备注（管理员/团队负责人核实）
    // ==========================================
    router.post('/verify', authenticateToken, async (req, res) => {
        try {
            const { record_id } = req.body;
            if (!record_id) return res.json({ success: false, message: '缺少参数' });

            const isManager = req.user.role === 'admin' || req.user.role === 'team_leader' || req.user.is_attendance_admin;
            if (!isManager) {
                return res.json({ success: false, message: '仅管理员或团队负责人可核实' });
            }

            const record = await dbGet(db, 'SELECT * FROM attendance_records WHERE id = ?', [record_id]);
            if (!record) return res.json({ success: false, message: '记录不存在' });
            if (!record.remark) return res.json({ success: false, message: '该记录没有备注，无需核实' });

            await dbRun(db, `
                UPDATE attendance_records SET verified_by = ?, verified_at = ? WHERE id = ?
            `, [req.user.display_name || req.user.username, getNow(), record_id]);

            res.json({ success: true, message: '已核实' });
        } catch (e) {
            res.json({ success: false, message: e.message });
        }
    });

    // ==========================================
    // 审批记录查询（支持类型、日期、姓名筛选+分页）
    // ==========================================
    router.get('/approvals', authenticateToken, async (req, res) => {
        try {
            const { start_date, end_date, approval_type, name, dept_name, status, page = 1, page_size = 25 } = req.query;

            let sql = 'SELECT * FROM approval_instances WHERE 1=1';
            const params = [];

            if (start_date) { sql += ' AND start_time >= ?'; params.push(start_date); }
            if (end_date) { sql += ' AND start_time <= ?'; params.push(end_date + ' 23:59:59'); }
            if (approval_type) { sql += ' AND approval_type = ?'; params.push(approval_type); }
            if (name) { sql += ' AND originator_name LIKE ?'; params.push(`%${name}%`); }
            if (dept_name) { sql += ' AND dept_name = ?'; params.push(dept_name); }
            if (status === 'agree') { sql += " AND status = 'COMPLETED' AND result = 'agree'"; }
            else if (status === 'refuse') { sql += " AND status = 'COMPLETED' AND result = 'refuse'"; }
            else if (status === 'running') { sql += " AND status IN ('NEW','RUNNING')"; }

            // 权限过滤
            const pfa = await applyPermissionFilter(sql, params, req.user, 'originator_name');
            sql = pfa.sql;

            const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
            const countRow = await dbGet(db, countSql, params);
            const total = countRow?.total || 0;

            const offset = (parseInt(page) - 1) * parseInt(page_size);
            sql += ' ORDER BY create_time DESC LIMIT ? OFFSET ?';
            params.push(parseInt(page_size), offset);

            const rows = await dbAll(db, sql, params);

            res.json({
                success: true,
                data: rows,
                pagination: { total, page: parseInt(page), page_size: parseInt(page_size), total_pages: Math.ceil(total / parseInt(page_size)) }
            });
        } catch (e) {
            console.error('❌ [审批] 查询失败:', e.message);
            res.json({ success: false, message: e.message });
        }
    });

    // ==========================================
    // 批量查某日期范围内的生效审批（打卡明细用）
    // ==========================================
    router.get('/approvals/by-range', authenticateToken, async (req, res) => {
        try {
            const { start_date, end_date } = req.query;
            if (!start_date || !end_date) {
                return res.json({ success: false, data: [] });
            }

            // 查询业务时间与日期范围有交集的已批准审批
            const rows = await dbAll(db, `
                SELECT instance_id, approval_type, originator_userid, originator_name,
                       start_time, end_time, duration_hours, leave_type, reason
                FROM approval_instances
                WHERE status = 'COMPLETED' AND result = 'agree'
                  AND start_time <= ? AND (end_time >= ? OR end_time IS NULL)
            `, [end_date + ' 23:59:59', start_date]);

            res.json({ success: true, data: rows });
        } catch (e) {
            res.json({ success: false, data: [] });
        }
    });

    // ==========================================
    // 手动同步审批数据（仅管理员）
    // ==========================================
    router.post('/sync-approvals', authenticateToken, requireAttendanceAdmin, async (req, res) => {
        try {
            const { start_date, end_date, types } = req.body;
            if (!start_date || !end_date) {
                return res.json({ success: false, message: '请提供日期范围' });
            }

            console.log(`📡 [审批] 手动触发同步: ${start_date} ~ ${end_date}，操作人: ${req.user.username}`);
            const result = await dingtalkService.syncApprovalData(db, start_date, end_date, types);

            await dbRun(db, `
                INSERT INTO attendance_sync_log (sync_date, total, synced, failed, skipped, triggered_by)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [`${start_date}~${end_date}(审批)`, result.total, result.synced, result.failed, result.skipped, req.user.username]);

            res.json({
                success: true,
                message: `审批同步完成: ${result.synced}条成功, ${result.skipped}条跳过, ${result.failed}条失败`,
                data: result
            });
        } catch (e) {
            console.error('❌ [审批] 同步失败:', e.message);
            res.json({ success: false, message: '审批同步失败: ' + e.message });
        }
    });

    // ==========================================
    // 直播统计（仅统计钉钉主播部门的人）
    // 关联逻辑：
    //   捕鱼 → stream_schedules.real_name 直接匹配钉钉真名
    //   斗地主 → 钉钉真名 → anchors.douyin_id → biz-anchor-live
    //   三冰 → 钉钉真名 → anchors.douyin_id → biz-minigame
    // ==========================================
    router.get('/anchor-attendance', authenticateToken, async (req, res) => {
        try {
            const { start_date, end_date, product, name } = req.query;
            if (!start_date || !end_date) {
                return res.json({ success: false, message: '请提供日期范围' });
            }

            // 1. 从钉钉架构获取主播部门的真名列表
            const anchorRealNames = await getAnchorNames();
            if (anchorRealNames.length === 0) {
                return res.json({ success: true, data: [], total: 0, message: '未找到主播部门人员，请先同步钉钉组织架构' });
            }

            // 2. 用真名去 anchors 表匹配，拿到抖音号（用于关联经营数据）
            const placeholders = anchorRealNames.map(() => '?').join(',');
            const anchorRows = await dbAll(db,
                `SELECT name, douyin_id FROM anchors WHERE name IN (${placeholders}) AND douyin_id IS NOT NULL AND douyin_id != ''`,
                anchorRealNames
            );
            // 抖音号 → 真名 映射
            const douyinToName = {};
            for (const a of anchorRows) {
                douyinToName[String(a.douyin_id)] = a.name;
            }
            const validDouyinIds = new Set(Object.keys(douyinToName));

            const results = [];
            const anchorNameSet = new Set(anchorRealNames);

            // ---------- 捕鱼排班数据（通过 real_name 关联） ----------
            if (!product || product === '捕鱼大作战' || product === '途游休闲捕鱼' || product === '电玩捕鱼') {
                let fishSql = `
                    SELECT s.date, s.streamer_name, s.real_name, s.account_name, s.start_hour, s.end_hour, s.role, s.gift_amount,
                           a.product_type
                    FROM stream_schedules s
                    LEFT JOIN stream_accounts a ON s.account_name = a.name
                    WHERE s.date >= ? AND s.date <= ?
                    AND s.real_name IS NOT NULL AND s.real_name != ''
                `;
                const fishParams = [start_date, end_date];

                const productTypeMap = {
                    '捕鱼大作战': '3D捕鱼',
                    '途游休闲捕鱼': 'UE4捕鱼',
                    '电玩捕鱼': 'URP捕鱼'
                };
                if (product && productTypeMap[product]) {
                    fishSql += ' AND a.product_type = ?';
                    fishParams.push(productTypeMap[product]);
                }
                if (name) {
                    fishSql += ' AND (s.real_name LIKE ? OR s.streamer_name LIKE ?)';
                    fishParams.push(`%${name}%`, `%${name}%`);
                }

                const fishRows = await dbAll(db, fishSql, fishParams);

                // 按真名+日期+产品聚合
                const fishMap = {};
                for (const row of fishRows) {
                    if (!anchorNameSet.has(row.real_name)) continue;
                    const pt = row.product_type || '3D捕鱼';
                    const key = `${row.real_name}|${row.date}|${pt}`;
                    if (!fishMap[key]) {
                        fishMap[key] = {
                            realName: row.real_name,
                            displayName: row.streamer_name,
                            date: row.date,
                            product: pt,
                            schedules: [],
                            totalHours: 0,
                            giftAmount: 0
                        };
                    }
                    const duration = (row.end_hour || 0) - (row.start_hour || 0);
                    fishMap[key].schedules.push({
                        account: row.account_name,
                        start: row.start_hour,
                        end: row.end_hour,
                        role: row.role
                    });
                    fishMap[key].totalHours += duration > 0 ? duration : 0;
                    fishMap[key].giftAmount += row.gift_amount || 0;
                }

                for (const item of Object.values(fishMap)) {
                    results.push({
                        name: item.realName,
                        displayName: item.displayName,
                        date: item.date,
                        product: item.product,
                        source: 'schedule',
                        scheduledHours: Math.round(item.totalHours * 10) / 10,
                        actualHours: Math.round(item.totalHours * 10) / 10,
                        giftAmount: item.giftAmount,
                        scheduleDetail: item.schedules,
                        status: item.totalHours >= 5 ? 'normal' : item.totalHours > 0 ? 'short' : 'absent'
                    });
                }
            }

            // ---------- 斗地主直播数据（biz-anchor-live） ----------
            if (!product || product === '途游斗地主') {
                const ddzParams = [start_date, end_date];
                const ddzRows = await dbAll(db, `
                    SELECT data_date, content FROM business_data
                    WHERE type = 'biz-anchor-live' AND data_date >= ? AND data_date <= ?
                    AND content LIKE '%斗地主%'
                `, ddzParams);

                const ddzMap = {};
                for (const row of ddzRows) {
                    try {
                        const d = JSON.parse(row.content);
                        const gameName = d['游戏名称'] || '';
                        if (!gameName.includes('斗地主')) continue;
                        const douyinId = String(d['抖音号'] || '');
                        if (!douyinId || !validDouyinIds.has(douyinId)) continue;
                        const realName = douyinToName[douyinId];
                        const displayName = d['昵称'] || d['主播昵称'] || realName;
                        if (name && !realName.includes(name) && !displayName.includes(name)) continue;

                        const key = `${douyinId}|${row.data_date}`;
                        if (!ddzMap[key]) {
                            ddzMap[key] = { realName, displayName, date: row.data_date, totalHours: 0, revenue: 0, project: d['项目'] || '' };
                        }
                        ddzMap[key].totalHours += parseFloat(d['游戏开播时长']) || 0;
                        ddzMap[key].revenue += parseFloat(d['直播-游戏流水(分成前)']) || 0;
                    } catch (e) {}
                }

                for (const item of Object.values(ddzMap)) {
                    results.push({
                        name: item.realName,
                        displayName: item.displayName,
                        date: item.date,
                        product: '途游斗地主',
                        source: 'live_data',
                        scheduledHours: null,
                        actualHours: Math.round(item.totalHours * 100) / 100,
                        revenue: Math.round(item.revenue * 100) / 100,
                        project: item.project,
                        status: item.totalHours >= 4 ? 'normal' : item.totalHours > 0 ? 'short' : 'absent'
                    });
                }
            }

            // ---------- 三冰小游戏数据（biz-minigame） ----------
            if (!product || product === '三国:冰河时代') {
                const sbParams = [start_date, end_date];
                const sbRows = await dbAll(db, `
                    SELECT data_date, content FROM business_data
                    WHERE type = 'biz-minigame' AND data_date >= ? AND data_date <= ?
                    AND content LIKE '%三国%'
                `, sbParams);

                const sbMap = {};
                for (const row of sbRows) {
                    try {
                        const d = JSON.parse(row.content);
                        const gameName = d['小游戏名称'] || '';
                        if (!gameName.includes('三国')) continue;
                        const douyinId = String(d['抖音号'] || '');
                        if (!douyinId || !validDouyinIds.has(douyinId)) continue;
                        const realName = douyinToName[douyinId];
                        const displayName = d['主播昵称'] || d['昵称'] || realName;
                        if (name && !realName.includes(name) && !displayName.includes(name)) continue;

                        const key = `${douyinId}|${row.data_date}`;
                        if (!sbMap[key]) {
                            sbMap[key] = { realName, displayName, date: row.data_date, totalHours: 0, revenue: 0, project: d['项目'] || '' };
                        }
                        sbMap[key].totalHours += parseFloat(d['小游戏开播时长']) || 0;
                        sbMap[key].revenue += parseFloat(d['直播-小游戏收入主播分成(分成后)']) || 0;
                    } catch (e) {}
                }

                for (const item of Object.values(sbMap)) {
                    results.push({
                        name: item.realName,
                        displayName: item.displayName,
                        date: item.date,
                        product: '三国:冰河时代',
                        source: 'minigame_data',
                        scheduledHours: null,
                        actualHours: Math.round(item.totalHours * 100) / 100,
                        revenue: Math.round(item.revenue * 100) / 100,
                        project: item.project,
                        status: item.totalHours >= 4 ? 'normal' : item.totalHours > 0 ? 'short' : 'absent'
                    });
                }
            }

            // 按日期倒序 + 主播名排序
            results.sort((a, b) => {
                if (a.date !== b.date) return b.date.localeCompare(a.date);
                return a.name.localeCompare(b.name);
            });

            res.json({
                success: true,
                data: results,
                total: results.length
            });
        } catch (e) {
            console.error('❌ [直播统计] 查询失败:', e.message);
            res.json({ success: false, message: '查询失败: ' + e.message });
        }
    });

    // ==========================================
    // 直播统计汇总（按主播聚合统计，仅统计主播部门的人）
    // ==========================================
    router.get('/anchor-attendance/summary', authenticateToken, async (req, res) => {
        try {
            const { start_date, end_date, product, name } = req.query;
            if (!start_date || !end_date) {
                return res.json({ success: false, message: '请提供日期范围' });
            }

            // 1. 钉钉架构主播真名 → anchors 抖音号
            const anchorRealNames = await getAnchorNames();
            if (anchorRealNames.length === 0) {
                return res.json({ success: true, data: [], message: '未找到主播部门人员' });
            }
            const placeholders = anchorRealNames.map(() => '?').join(',');
            const anchorRows = await dbAll(db,
                `SELECT name, douyin_id FROM anchors WHERE name IN (${placeholders}) AND douyin_id IS NOT NULL AND douyin_id != ''`,
                anchorRealNames
            );
            const douyinToName = {};
            for (const a of anchorRows) {
                douyinToName[String(a.douyin_id)] = a.name;
            }
            const validDouyinIds = new Set(Object.keys(douyinToName));

            const allData = [];
            const anchorNameSet = new Set(anchorRealNames);

            // --- 捕鱼（排班 real_name） ---
            if (!product || product === '捕鱼大作战' || product === '途游休闲捕鱼' || product === '电玩捕鱼') {
                const productTypeMap = { '捕鱼大作战': '3D捕鱼', '途游休闲捕鱼': 'UE4捕鱼', '电玩捕鱼': 'URP捕鱼' };
                let fishSql = `SELECT s.date, s.real_name, s.start_hour, s.end_hour, a.product_type
                    FROM stream_schedules s LEFT JOIN stream_accounts a ON s.account_name = a.name
                    WHERE s.date >= ? AND s.date <= ? AND s.real_name IS NOT NULL AND s.real_name != ''`;
                const fp = [start_date, end_date];
                if (product && productTypeMap[product]) { fishSql += ' AND a.product_type = ?'; fp.push(productTypeMap[product]); }
                if (name) { fishSql += ' AND s.real_name LIKE ?'; fp.push(`%${name}%`); }
                const rows = await dbAll(db, fishSql, fp);
                for (const r of rows) {
                    if (!anchorNameSet.has(r.real_name)) continue;
                    const dur = (r.end_hour || 0) - (r.start_hour || 0);
                    allData.push({ name: r.real_name, date: r.date, product: r.product_type || '3D捕鱼', hours: dur > 0 ? dur : 0 });
                }
            }

            // --- 斗地主 ---
            if (!product || product === '途游斗地主') {
                const rows = await dbAll(db, `SELECT data_date, content FROM business_data WHERE type='biz-anchor-live' AND data_date>=? AND data_date<=? AND content LIKE '%斗地主%'`, [start_date, end_date]);
                for (const r of rows) {
                    try {
                        const d = JSON.parse(r.content);
                        if (!(d['游戏名称'] || '').includes('斗地主')) continue;
                        const douyinId = String(d['抖音号'] || '');
                        if (!douyinId || !validDouyinIds.has(douyinId)) continue;
                        const realName = douyinToName[douyinId];
                        if (name && !realName.includes(name)) continue;
                        allData.push({ name: realName, date: r.data_date, product: '途游斗地主', hours: parseFloat(d['游戏开播时长']) || 0 });
                    } catch (e) {}
                }
            }

            // --- 三冰 ---
            if (!product || product === '三国:冰河时代') {
                const rows = await dbAll(db, `SELECT data_date, content FROM business_data WHERE type='biz-minigame' AND data_date>=? AND data_date<=? AND content LIKE '%三国%'`, [start_date, end_date]);
                for (const r of rows) {
                    try {
                        const d = JSON.parse(r.content);
                        if (!(d['小游戏名称'] || '').includes('三国')) continue;
                        const douyinId = String(d['抖音号'] || '');
                        if (!douyinId || !validDouyinIds.has(douyinId)) continue;
                        const realName = douyinToName[douyinId];
                        if (name && !realName.includes(name)) continue;
                        allData.push({ name: realName, date: r.data_date, product: '三国:冰河时代', hours: parseFloat(d['小游戏开播时长']) || 0 });
                    } catch (e) {}
                }
            }

            // 获取所有主播的休息日
            const restDayMap = {}; // name → rest_day ('0'-'7')
            const allAnchors = await dbAll(db, `SELECT name, rest_day FROM anchors WHERE name IN (${placeholders})`, anchorRealNames);
            for (const a of allAnchors) {
                restDayMap[a.name] = a.rest_day || '0';
            }

            // 获取日期范围内的无法开播/培训记录
            const noteRows = await dbAll(db,
                `SELECT anchor_name, note_date, note_type FROM anchor_attendance_notes WHERE note_date >= ? AND note_date <= ? AND note_type IN ('cannot_stream', 'training')`,
                [start_date, end_date]
            );
            const cannotStreamMap = {}; // 'name|date' → true
            const trainingMap = {}; // 'name|date' → true
            for (const n of noteRows) {
                if (n.note_type === 'cannot_stream') cannotStreamMap[`${n.anchor_name}|${n.note_date}`] = true;
                if (n.note_type === 'training') trainingMap[`${n.anchor_name}|${n.note_date}`] = true;
            }

            // 按主播聚合，保留每天的时长数据（矩阵视图用）
            // 先初始化所有钉钉主播（确保无数据的也出现在列表）
            const peopleMap = {};
            for (const rn of anchorRealNames) {
                peopleMap[rn] = { name: rn, days: {}, totalHours: 0, products: new Set(), restDay: restDayMap[rn] || '0' };
            }
            for (const d of allData) {
                if (!peopleMap[d.name]) {
                    peopleMap[d.name] = { name: d.name, days: {}, totalHours: 0, products: new Set(), restDay: restDayMap[d.name] || '0' };
                }
                const p = peopleMap[d.name];
                p.products.add(d.product);
                p.totalHours += d.hours;
                const day = parseInt(d.date.split('-')[2], 10);
                if (!p.days[day]) {
                    p.days[day] = { hours: 0, products: [] };
                }
                p.days[day].hours += d.hours;
                if (!p.days[day].products.includes(d.product)) {
                    p.days[day].products.push(d.product);
                }
            }

            // 标记无法开播和培训的天
            for (const key of Object.keys(cannotStreamMap)) {
                const [aName, aDate] = key.split('|');
                if (!peopleMap[aName]) continue;
                const day = parseInt(aDate.split('-')[2], 10);
                if (!peopleMap[aName].days[day]) {
                    peopleMap[aName].days[day] = { hours: 0, products: [] };
                }
                peopleMap[aName].days[day].cannotStream = true;
            }
            for (const key of Object.keys(trainingMap)) {
                const [aName, aDate] = key.split('|');
                if (!peopleMap[aName]) continue;
                const day = parseInt(aDate.split('-')[2], 10);
                if (!peopleMap[aName].days[day]) {
                    peopleMap[aName].days[day] = { hours: 0, products: [] };
                }
                peopleMap[aName].days[day].training = true;
            }

            // 计算日期范围内的天数
            const startD = new Date(start_date);
            const endD = new Date(end_date);
            const totalDays = Math.ceil((endD - startD) / 86400000) + 1;

            const people = Object.values(peopleMap)
                .filter(p => p.totalHours > 0 || Object.keys(p.days).length > 0)
                .map(p => ({
                    name: p.name,
                    restDay: p.restDay,
                    products: [...p.products],
                    totalHours: Math.round(p.totalHours * 10) / 10,
                    activeDays: Object.values(p.days).filter(d => d.hours > 0).length,
                    avgHoursPerDay: Object.values(p.days).filter(d => d.hours > 0).length > 0 ? Math.round(p.totalHours / Object.values(p.days).filter(d => d.hours > 0).length * 10) / 10 : 0,
                    days: Object.fromEntries(
                        Object.entries(p.days).map(([day, info]) => [day, {
                            hours: Math.round(info.hours * 10) / 10,
                            products: info.products,
                            cannotStream: info.cannotStream || false,
                            training: info.training || false
                        }])
                    )
                }));

            people.sort((a, b) => b.totalHours - a.totalHours);

            res.json({
                success: true,
                data: {
                    people,
                    startDate: start_date,
                    endDate: end_date,
                    totalDays
                }
            });
        } catch (e) {
            console.error('❌ [直播统计汇总] 查询失败:', e.message);
            res.json({ success: false, message: '查询失败: ' + e.message });
        }
    });

    // ==========================================
    // 主播月度日历（点击主播名弹窗用）
    // ==========================================
    router.get('/anchor-calendar', authenticateToken, async (req, res) => {
        try {
            const { name, month } = req.query; // name=真名, month=2026-03
            if (!name || !month) return res.json({ success: false, message: '缺少参数' });

            const [year, mon] = month.split('-').map(Number);
            const daysInMonth = new Date(year, mon, 0).getDate();
            const startDate = `${month}-01`;
            const endDate = `${month}-${String(daysInMonth).padStart(2, '0')}`;

            // 获取主播休息日（从 anchors 表）
            const anchor = await dbGet(db, `SELECT rest_day, douyin_id FROM anchors WHERE name = ?`, [name]);
            const restDay = anchor?.rest_day || '0'; // '0'=无, '1'-'7'=周一~周日
            const douyinId = anchor?.douyin_id ? String(anchor.douyin_id) : '';

            // 获取直播数据（3个来源合并）
            const liveData = {}; // { '2026-03-01': { hours, products: [], details: [] } }

            // 捕鱼（排班 real_name）
            const fishRows = await dbAll(db,
                `SELECT s.date, s.start_hour, s.end_hour, a.product_type
                 FROM stream_schedules s LEFT JOIN stream_accounts a ON s.account_name = a.name
                 WHERE s.date >= ? AND s.date <= ? AND s.real_name = ?`,
                [startDate, endDate, name]
            );
            for (const r of fishRows) {
                const dur = (r.end_hour || 0) - (r.start_hour || 0);
                if (dur <= 0) continue;
                if (!liveData[r.date]) liveData[r.date] = { hours: 0, products: [], details: [] };
                liveData[r.date].hours += dur;
                const prod = r.product_type || '3D捕鱼';
                if (!liveData[r.date].products.includes(prod)) liveData[r.date].products.push(prod);
                liveData[r.date].details.push({ product: prod, hours: dur });
            }

            // 斗地主（douyin_id）
            if (douyinId) {
                const ddzRows = await dbAll(db,
                    `SELECT data_date, content FROM business_data WHERE type='biz-anchor-live' AND data_date>=? AND data_date<=? AND content LIKE '%斗地主%'`,
                    [startDate, endDate]
                );
                for (const r of ddzRows) {
                    try {
                        const d = JSON.parse(r.content);
                        if (!(d['游戏名称'] || '').includes('斗地主')) continue;
                        if (String(d['抖音号'] || '') !== douyinId) continue;
                        const hours = parseFloat(d['游戏开播时长']) || 0;
                        if (hours <= 0) continue;
                        if (!liveData[r.data_date]) liveData[r.data_date] = { hours: 0, products: [], details: [] };
                        liveData[r.data_date].hours += hours;
                        if (!liveData[r.data_date].products.includes('途游斗地主')) liveData[r.data_date].products.push('途游斗地主');
                        liveData[r.data_date].details.push({ product: '途游斗地主', hours });
                    } catch (e) {}
                }

                // 三冰（douyin_id）
                const sgRows = await dbAll(db,
                    `SELECT data_date, content FROM business_data WHERE type='biz-minigame' AND data_date>=? AND data_date<=? AND content LIKE '%三国%'`,
                    [startDate, endDate]
                );
                for (const r of sgRows) {
                    try {
                        const d = JSON.parse(r.content);
                        if (!(d['小游戏名称'] || '').includes('三国')) continue;
                        if (String(d['抖音号'] || '') !== douyinId) continue;
                        const hours = parseFloat(d['小游戏开播时长']) || 0;
                        if (hours <= 0) continue;
                        if (!liveData[r.data_date]) liveData[r.data_date] = { hours: 0, products: [], details: [] };
                        liveData[r.data_date].hours += hours;
                        if (!liveData[r.data_date].products.includes('三国:冰河时代')) liveData[r.data_date].products.push('三国:冰河时代');
                        liveData[r.data_date].details.push({ product: '三国:冰河时代', hours });
                    } catch (e) {}
                }
            }

            // 获取备注和无法开播记录
            const notes = await dbAll(db,
                `SELECT * FROM anchor_attendance_notes WHERE anchor_name = ? AND note_date >= ? AND note_date <= ?`,
                [name, startDate, endDate]
            );

            // 获取 anchor_daily_status 标记（统一数据源）
            const statusMarks = await dbAll(db,
                `SELECT * FROM anchor_daily_status WHERE user_name = ? AND date >= ? AND date <= ? AND approval_status = 'approved'`,
                [name, startDate, endDate]
            );

            // 合并：将 daily_status 中有但 notes 中没有的标记补充到 notes 中（兼容前端渲染）
            const noteKeys = new Set(notes.map(n => `${n.note_date}|${n.note_type}`));
            for (const m of statusMarks) {
                if ((m.status === 'cannot_stream' || m.status === 'training') && !noteKeys.has(`${m.date}|${m.status}`)) {
                    notes.push({
                        id: `ds_${m.id}`,
                        anchor_name: name,
                        note_date: m.date,
                        note_type: m.status,
                        content: m.remark || '',
                        created_by: m.marked_by,
                        created_at: m.created_at
                    });
                }
            }

            // 捕鱼主播标记：有排班记录即为捕鱼主播（没排班的日子=休息）
            const isFishAnchor = fishRows.length > 0;

            res.json({
                success: true,
                data: { restDay, liveData, notes, statusMarks, isFishAnchor }
            });
        } catch (e) {
            console.error('❌ [主播日历] 查询失败:', e.message);
            res.json({ success: false, message: '查询失败: ' + e.message });
        }
    });

    // ==========================================
    // 主播考勤备注/无法开播 — 添加或更新
    // ==========================================
    router.post('/anchor-note', authenticateToken, async (req, res) => {
        try {
            const { anchor_name, note_date, note_type, content } = req.body;
            // note_type: 'remark'(备注) 或 'cannot_stream'(无法开播) 或 'training'(培训)
            if (!anchor_name || !note_date || !note_type) {
                return res.json({ success: false, message: '参数不完整' });
            }

            // UPSERT: 同人同日同类型只保留一条
            const existing = await dbGet(db,
                `SELECT id FROM anchor_attendance_notes WHERE anchor_name = ? AND note_date = ? AND note_type = ?`,
                [anchor_name, note_date, note_type]
            );

            if (existing) {
                await dbRun(db,
                    `UPDATE anchor_attendance_notes SET content = ?, created_by = ?, created_at = ?, verified_by = NULL, verified_at = NULL WHERE id = ?`,
                    [content || '', req.user.username, getNow(), existing.id]
                );
            } else {
                await dbRun(db,
                    `INSERT INTO anchor_attendance_notes (anchor_name, note_date, note_type, content, created_by, created_at) VALUES (?,?,?,?,?,?)`,
                    [anchor_name, note_date, note_type, content || '', req.user.username, getNow()]
                );
            }

            // 同步到 anchor_daily_status（统一标记数据源）
            if (note_type === 'cannot_stream' || note_type === 'training') {
                const now = getNow();
                const currentUser = req.user;
                // 查找主播的 user_id
                const anchorUser = await dbGet(db, `SELECT id FROM users WHERE name = ?`, [anchor_name]);
                const userId = anchorUser ? anchorUser.id : -(await dbGet(db, `SELECT id FROM anchors WHERE name = ?`, [anchor_name]))?.id || -Date.now();

                await dbRun(db,
                    `INSERT INTO anchor_daily_status (user_id, user_name, date, status, remark, marked_by, approval_status, approver_role, approved_by, approved_at, reject_reason, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, 'approved', '', ?, ?, '', ?, ?)
                     ON CONFLICT(user_id, date) DO UPDATE SET
                        status = excluded.status,
                        remark = excluded.remark,
                        marked_by = excluded.marked_by,
                        approval_status = 'approved',
                        approved_by = excluded.approved_by,
                        approved_at = excluded.approved_at,
                        updated_at = excluded.updated_at`,
                    [userId, anchor_name, note_date, note_type, content || '', currentUser.name, currentUser.name, now, now, now]
                );
            }

            res.json({ success: true });
        } catch (e) {
            res.json({ success: false, message: e.message });
        }
    });

    // 删除备注/无法开播记录
    router.delete('/anchor-note/:id', authenticateToken, async (req, res) => {
        try {
            // 删除前先获取记录信息，用于同步清理 anchor_daily_status
            const note = await dbGet(db, `SELECT * FROM anchor_attendance_notes WHERE id = ?`, [req.params.id]);
            await dbRun(db, `DELETE FROM anchor_attendance_notes WHERE id = ?`, [req.params.id]);
            // 同步清理 anchor_daily_status
            if (note && (note.note_type === 'cannot_stream' || note.note_type === 'training')) {
                await dbRun(db,
                    `DELETE FROM anchor_daily_status WHERE user_name = ? AND date = ? AND status = ?`,
                    [note.anchor_name, note.note_date, note.note_type]
                );
            }
            res.json({ success: true });
        } catch (e) {
            res.json({ success: false, message: e.message });
        }
    });

    // ==========================================
    // 导出考勤报表（Excel，3个sheet）
    // ==========================================
    router.get('/export', authenticateToken, requireAttendanceAdmin, async (req, res) => {
        try {
            const { start_date, end_date, staff_holidays } = req.query;
            if (!start_date || !end_date) return res.json({ success: false, message: '请提供日期范围' });
            const staffHolidayDays = parseInt(staff_holidays || '0', 10); // 职能节假日天数

            // 生成日期列表
            const dates = [];
            const sd = new Date(start_date), ed = new Date(end_date);
            for (let d = new Date(sd); d <= ed; d.setDate(d.getDate() + 1)) {
                const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                const dow = d.getDay(); // 0=日
                dates.push({ date: ds, day: d.getDate(), dow });
            }
            const totalDays = dates.length;
            const exportRoster = indexRoster(await getRosterDays(db, start_date, end_date));

            // 星期几的中文简称（用于打卡时间表头）
            const dowLabels = ['日','一','二','三','四','五','六'];

            // ====== 获取主播名单 ======
            const anchorRealNames = await getCachedAnchorNames();
            const anchorNameSet = new Set(anchorRealNames);

            // 获取所有主播信息（rest_day, douyin_id）— 同时查 anchors 和 users 表
            const anchorInfoMap = {};
            if (anchorRealNames.length > 0) {
                const ph = anchorRealNames.map(() => '?').join(',');
                const anchorInfoRows = await dbAll(db, `SELECT name, rest_day, douyin_id FROM anchors WHERE name IN (${ph})`, anchorRealNames);
                for (const a of anchorInfoRows) anchorInfoMap[a.name] = a;
                // 补充：anchors表没有的人，从users表查rest_day
                const userRestRows = await dbAll(db, `SELECT name, rest_day FROM users WHERE rest_day IS NOT NULL AND rest_day != '0' AND name IN (${ph})`, anchorRealNames);
                for (const u of userRestRows) {
                    if (!anchorInfoMap[u.name]) anchorInfoMap[u.name] = { name: u.name, rest_day: u.rest_day };
                }
            }

            // 获取主播员工类别（从钉钉部门映射：捕鱼/斗地主/三国/麻将）
            const ANCHOR_DEPT_MAP = {
                '929188023': '捕鱼', '932021044': '斗地主',
                '981039977': '三国', '928732653': '麻将'
            };
            const anchorCategoryMap = {}; // name → 产品类别
            const allDingUsers = await dbAll(db, `SELECT name, dept_ids FROM dingtalk_users WHERE status = 1`);
            for (const u of allDingUsers) {
                if (!u.dept_ids) continue;
                let ids = [];
                try { ids = JSON.parse(u.dept_ids).map(String); } catch (e) { continue; }
                for (const id of ids) {
                    if (ANCHOR_DEPT_MAP[id]) {
                        anchorCategoryMap[u.name] = ANCHOR_DEPT_MAP[id];
                        break;
                    }
                }
            }

            // 获取无法开播和培训天数
            const noteRows = anchorRealNames.length > 0
                ? await dbAll(db, `SELECT anchor_name, note_date, note_type FROM anchor_attendance_notes WHERE note_date >= ? AND note_date <= ? AND note_type IN ('cannot_stream', 'training')`, [start_date, end_date])
                : [];
            const anchorNoteCount = {}; // name → { cannot_stream: count, training: count }
            for (const n of noteRows) {
                if (!anchorNoteCount[n.anchor_name]) anchorNoteCount[n.anchor_name] = { cannot_stream: 0, training: 0 };
                if (n.note_type === 'cannot_stream') anchorNoteCount[n.anchor_name].cannot_stream++;
                if (n.note_type === 'training') anchorNoteCount[n.anchor_name].training++;
            }

            // ====== Sheet 1: 考勤表-主播 ======
            const anchorSheetData = [];
            // 空行 + 表头
            anchorSheetData.push([]);
            anchorSheetData.push(['序号', '合同主体', '员工类别', '姓名', '一级组织', '入职日期', '离职日期', '应出勤天数', '无法开播天数', '培训天数', '实出勤天数', '公休天数', '备注']);

            // 按名字排序
            const sortedAnchors = [...anchorRealNames].sort((a, b) => a.localeCompare(b, 'zh'));
            let anchorIdx = 0;
            for (const name of sortedAnchors) {
                // 钉钉名可能含手机号后缀（如"付振东 17261788891"），anchors表用短名
                const shortName = name.includes(' ') ? name.split(' ')[0] : name;
                const info = anchorInfoMap[name] || anchorInfoMap[shortName] || {};
                const restDayNum = parseInt(info.rest_day || '0', 10); // 0=无, 1=周一...7=周日

                // 计算公休天数（rest_day对应的周几在日期范围内出现几次）
                let restCount = 0;
                if (restDayNum > 0) {
                    const targetDow = restDayNum === 7 ? 0 : restDayNum; // 转为JS的周日=0
                    restCount = dates.filter(d => d.dow === targetDow).length;
                }
                if (dates.some(d => exportRoster({ name, work_date: d.date }))) {
                    restCount = dates.filter(d => {
                        const planned = exportRoster({ name, work_date: d.date });
                        return planned ? planned.status === 'rest' : restDayNum > 0 && d.dow === (restDayNum === 7 ? 0 : restDayNum);
                    }).length;
                }

                const cannotStreamDays = anchorNoteCount[name]?.cannot_stream || 0;
                const trainingDays = anchorNoteCount[name]?.training || 0;
                const shouldAttend = totalDays - restCount;
                const actualAttend = shouldAttend - cannotStreamDays - trainingDays;

                anchorIdx++;
                anchorSheetData.push([
                    anchorIdx,
                    '奇迹',
                    anchorCategoryMap[name] || anchorCategoryMap[shortName] || '', // 员工类别（捕鱼/斗地主/三国/麻将）
                    shortName, // 显示短名（去除手机号后缀）
                    '直播部门',
                    null, // 入职日期
                    null, // 离职日期
                    shouldAttend,
                    cannotStreamDays || null,
                    trainingDays || null,
                    actualAttend,
                    restCount,
                    '' // 备注
                ]);
            }

            // ====== 获取职能人员考勤数据 ======
            const hiddenClause = HIDDEN_DEPTS.length ? ` AND dept_name NOT IN (${HIDDEN_DEPTS.map(() => '?').join(',')})` : '';
            const staffRecords = await applyWorkTimeOverride(await dbAll(db,
                `SELECT name, dept_name, dingtalk_userid, work_date, on_duty_time, off_duty_time,
                        on_duty_result, off_duty_result, late_minutes, early_leave_minutes,
                        all_check_times, remark, raw_data
                 FROM attendance_records
                 WHERE work_date >= ? AND work_date <= ?
                   ${hiddenClause}
                 ORDER BY name, work_date`,
                [start_date, end_date, ...HIDDEN_DEPTS]
            ));

            // 过滤掉主播
            const nonAnchorRecords = staffRecords.filter(r => !anchorNameSet.has(r.name));

            // 获取审批数据（请假/外出/补卡/出差等）
            // 注：status='COMPLETED'表示审批通过，approval_type用英文(leave/go_out/repair_check/overtime)
            const approvalRows = await dbAll(db,
                `SELECT originator_name, approval_type, start_time, end_time, duration_hours, leave_type
                 FROM approval_instances
                 WHERE status = 'COMPLETED'
                   AND start_time <= ? AND (end_time >= ? OR end_time IS NULL)`,
                [end_date + ' 23:59:59', start_date]
            );

            // 按人聚合职能考勤
            const staffMap = {}; // name → { dept, userid, days: { date → record }, approvals }
            for (const r of nonAnchorRecords) {
                if (!staffMap[r.name]) staffMap[r.name] = { dept: r.dept_name, userid: r.dingtalk_userid, days: {} };
                staffMap[r.name].days[r.work_date] = r;
            }

            // 审批按人聚合
            const staffApprovalMap = {}; // name → [approvals]
            for (const a of approvalRows) {
                if (!a.originator_name) continue;
                if (!staffApprovalMap[a.originator_name]) staffApprovalMap[a.originator_name] = [];
                staffApprovalMap[a.originator_name].push(a);
            }

            // 获取职能人员的个人休息日（从users表），未设置默认周一(1)
            const staffNames = Object.keys(staffMap);
            const staffRestDayMap = {}; // name → rest_day数字
            if (staffNames.length > 0) {
                const userRestRows = await dbAll(db, `SELECT name, rest_day FROM users WHERE name IN (${staffNames.map(()=>'?').join(',')})`, staffNames);
                for (const u of userRestRows) staffRestDayMap[u.name] = parseInt(u.rest_day || '1', 10) || 1;
            }

            // 计算各假期天数（简化算法：按 duration_hours / 8 或直接按 approval 天数）
            function countApprovalDays(approvals, type, leaveType) {
                let total = 0;
                for (const a of (approvals || [])) {
                    if (type && a.approval_type !== type) continue;
                    if (leaveType && a.leave_type !== leaveType) continue;
                    total += (a.duration_hours || 0) / 8;
                }
                return Math.round(total * 10) / 10 || null;
            }

            // ====== Sheet 2: 考勤表-职能 ======
            const staffSheetData = [];
            staffSheetData.push([]);
            staffSheetData.push(['序号', '合同主体', '员工类别', '姓名', '一级组织', '入职日期', '离职日期',
                '薪资应出勤天数', '薪资实出勤天数', '餐补天数\n（午餐）', '餐补天数\n（晚餐）',
                '晨更天数', '出差天数', '事假总计', '非工作日事假', '病假总计', '非工作日病假',
                '年假', '婚假', '哺乳假', '产假', '丧假', '调休假', '产检假', '陪产假',
                '旷工天数', '迟到/早退次数（1小时内）', '迟到/早退次数（1-2小时）',
                '迟到/早退次数\n（2小时以上）', '漏打卡次数', '补卡次数', '当月是否有全勤', '备注']);

            const sortedStaffNames = Object.keys(staffMap).sort((a, b) => a.localeCompare(b, 'zh'));
            let staffIdx = 0;
            for (const name of sortedStaffNames) {
                const s = staffMap[name];
                const approvals = staffApprovalMap[name] || [];

                // 职能应出勤天数 = 月总天数 - 个人公休天数 - 节假日天数
                const restDayNum = staffRestDayMap[name] || 1; // 默认周一
                const targetDow = restDayNum === 7 ? 0 : restDayNum; // 转JS周日=0
                const scheduledDates = dates.filter(d => exportRoster({ name, work_date: d.date }));
                const personalRestCount = dates.filter(d => {
                    const planned = exportRoster({ name, work_date: d.date });
                    return planned ? planned.status === 'rest' : d.dow === targetDow;
                }).length;
                // 表格排休已含节假日，不再重复扣手工节假日。
                const workingDays = Math.max(0, totalDays - personalRestCount - (scheduledDates.length === totalDays ? 0 : staffHolidayDays));

                // 各类假期（approval_type: leave=请假, go_out=外出, repair_check=补卡, overtime=加班）
                const sickLeave = countApprovalDays(approvals, 'leave', '病假');
                const personalLeave = countApprovalDays(approvals, 'leave', '事假');
                const annualLeave = countApprovalDays(approvals, 'leave', '年假');
                const weddingLeave = countApprovalDays(approvals, 'leave', '婚假');
                const nursingLeave = countApprovalDays(approvals, 'leave', '哺乳假');
                const maternityLeave = countApprovalDays(approvals, 'leave', '产假');
                const bereavementLeave = countApprovalDays(approvals, 'leave', '丧假');
                const compLeave = countApprovalDays(approvals, 'leave', '调休');
                const prenatalLeave = countApprovalDays(approvals, 'leave', '产检假');
                const paternityLeave = countApprovalDays(approvals, 'leave', '陪产假');
                const businessTrip = countApprovalDays(approvals, 'go_out');
                const repairCount = countApprovalDays(approvals, 'repair_check') ? Math.round(countApprovalDays(approvals, 'repair_check') * 8) : null; // 补卡按次数

                // 统计迟到/早退/缺卡
                let lateUnder1h = 0, late1to2h = 0, lateOver2h = 0, missingPunch = 0, absentDays = 0;
                const dayRecords = Object.values(s.days);
                for (const r of dayRecords) {
                    const lateMins = r.late_minutes || 0;
                    const earlyMins = r.early_leave_minutes || 0;
                    const maxMins = Math.max(lateMins, earlyMins);
                    if (maxMins > 0) {
                        if (maxMins >= 120) lateOver2h++;
                        else if (maxMins >= 60) late1to2h++;
                        else lateUnder1h++;
                    }
                    if (r.on_duty_result === 'Absenteeism' || r.off_duty_result === 'Absenteeism') absentDays++;
                    if (r.on_duty_result === 'NotSigned' || r.off_duty_result === 'NotSigned') missingPunch++;
                }

                const totalLeave = (personalLeave||0) + (sickLeave||0) + (annualLeave||0) + (compLeave||0) + (weddingLeave||0) + (maternityLeave||0) + (bereavementLeave||0) + (nursingLeave||0) + (prenatalLeave||0) + (paternityLeave||0);
                const actualWork = workingDays - totalLeave - absentDays;
                const hasFullAttend = (lateUnder1h + late1to2h + lateOver2h + missingPunch + absentDays) === 0 && !personalLeave && !sickLeave;

                staffIdx++;
                staffSheetData.push([
                    staffIdx,
                    '奇迹互娱',
                    '正式',
                    name,
                    s.dept || '直播部',
                    null, // 入职日期
                    null, // 离职日期
                    workingDays,
                    Math.round(actualWork * 10) / 10,
                    Math.round(actualWork * 10) / 10, // 午餐餐补=实出勤
                    null, // 晚餐餐补
                    null, // 晨更
                    businessTrip, // 出差
                    personalLeave,
                    null, // 非工作日事假
                    sickLeave,
                    null, // 非工作日病假
                    annualLeave,
                    weddingLeave,
                    nursingLeave,
                    maternityLeave,
                    bereavementLeave,
                    compLeave,
                    prenatalLeave,
                    paternityLeave,
                    absentDays || null,
                    lateUnder1h || null,
                    late1to2h || null,
                    lateOver2h || null,
                    missingPunch || null,
                    repairCount,
                    hasFullAttend ? '是' : '否',
                    '' // 备注
                ]);
            }

            // ====== 生成 Excel（使用 ExcelJS 支持样式） ======

            const wb = new ExcelJS.Workbook();

            // 通用样式
            const headerFont = { bold: true, size: 11 };
            const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
            const thinBorder = {
                top: { style: 'thin' }, bottom: { style: 'thin' },
                left: { style: 'thin' }, right: { style: 'thin' }
            };
            const centerAlign = { horizontal: 'center', vertical: 'middle', wrapText: true };

            // 辅助：将 aoa 数据写入 ExcelJS sheet
            function writeSheet(ws, data, colWidths, headerRowIdx) {
                for (let r = 0; r < data.length; r++) {
                    const row = ws.addRow(data[r]);
                    row.eachCell({ includeEmpty: true }, (cell) => {
                        cell.border = thinBorder;
                        cell.alignment = centerAlign;
                    });
                    if (r === headerRowIdx) {
                        row.eachCell({ includeEmpty: true }, (cell) => {
                            cell.font = headerFont;
                            cell.fill = headerFill;
                        });
                    }
                }
                if (colWidths) {
                    ws.columns = colWidths.map(w => ({ width: w }));
                }
            }

            // ---- Sheet 1: 考勤表-主播 ----
            const ws1 = wb.addWorksheet('考勤表-主播');
            writeSheet(ws1, anchorSheetData, [6, 12, 10, 12, 10, 12, 12, 14, 14, 10, 14, 10, 20], 1);

            // ---- Sheet 2: 考勤表-职能 ----
            const ws2 = wb.addWorksheet('考勤表-职能');
            writeSheet(ws2, staffSheetData, Array(33).fill(14), 1);

            // ---- Sheet 3: 最终打卡时间 ----
            const ws3 = wb.addWorksheet('最终打卡时间');
            // 标题行
            ws3.addRow([`打卡时间 统计日期：${start_date} 至 ${end_date}`]);
            ws3.addRow([`报表生成时间：${getNow().replace('T', ' ')}`]);

            // 表头行1
            const punchHeader1 = ['姓名', '考勤组', '部门', '工号', '职位', 'UserId', '打卡时间'];
            // 填充空的日期列（打卡时间合并头）
            for (let i = 1; i < dates.length; i++) punchHeader1.push(null);
            const h1Row = ws3.addRow(punchHeader1);
            h1Row.eachCell({ includeEmpty: true }, (cell) => {
                cell.font = headerFont;
                cell.fill = headerFill;
                cell.border = thinBorder;
                cell.alignment = centerAlign;
            });
            // 合并"打卡时间"列头
            if (dates.length > 1) {
                ws3.mergeCells(3, 7, 3, 6 + dates.length);
            }

            // 表头行2：日期
            const punchHeader2 = [null, null, null, null, null, null];
            for (const d of dates) {
                const isWeekend = d.dow === 0 || d.dow === 6;
                punchHeader2.push(isWeekend ? dowLabels[d.dow] : String(d.day));
            }
            const h2Row = ws3.addRow(punchHeader2);
            h2Row.eachCell({ includeEmpty: true }, (cell, colNum) => {
                cell.font = headerFont;
                cell.border = thinBorder;
                cell.alignment = centerAlign;
                // 周末列标红
                if (colNum > 6) {
                    const di = colNum - 7;
                    if (di < dates.length && (dates[di].dow === 0 || dates[di].dow === 6)) {
                        cell.font = { bold: true, size: 11, color: { argb: 'FFFF0000' } };
                    }
                }
            });

            // 数据行
            for (const name of sortedStaffNames) {
                const s = staffMap[name];
                const rowData = [
                    name,
                    '',
                    (s.dept || '').replace(/\n/g, ' '),
                    null,
                    null,
                    s.userid || ''
                ];
                for (const d of dates) {
                    const rec = s.days[d.date];
                    if (!rec) {
                        rowData.push(null);
                    } else {
                        let times = [];
                        try { times = JSON.parse(rec.all_check_times || '[]'); } catch (e) {}
                        if (times.length === 0 && rec.on_duty_time) {
                            times = [rec.on_duty_time];
                            if (rec.off_duty_time && rec.off_duty_time !== rec.on_duty_time) times.push(rec.off_duty_time);
                        }
                        if (times.length === 0) {
                            rowData.push(null);
                        } else {
                            const first = times[0].substring(0, 5);
                            const last = times[times.length - 1].substring(0, 5);
                            // 用真换行，ExcelJS 支持 wrapText
                            rowData.push(first === last ? first : `${first}\n${last}`);
                        }
                    }
                }
                const dataRow = ws3.addRow(rowData);
                dataRow.eachCell({ includeEmpty: true }, (cell) => {
                    cell.border = thinBorder;
                    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                });
                dataRow.height = 30; // 两行打卡时间需要足够高度
            }

            // 设置列宽
            const punchColWidths = [12, 25, 20, 8, 8, 22];
            for (let i = 0; i < dates.length; i++) punchColWidths.push(12);
            ws3.columns = punchColWidths.map(w => ({ width: w }));

            // 输出文件
            const buf = await wb.xlsx.writeBuffer();
            const fileName = encodeURIComponent(`长沙奇迹互娱科技有限公司_考勤报表_${start_date}_${end_date}.xlsx`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fileName}`);
            res.send(Buffer.from(buf));

        } catch (e) {
            console.error('❌ [考勤] 导出失败:', e.message);
            res.status(500).json({ success: false, message: '导出失败: ' + e.message });
        }
    });

    return router;
};
