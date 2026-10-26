// server/services/dingtalk/dingtalkOpenService.js
// Version: V9.5.0 - 钉钉开放平台 API 服务（考勤数据同步）

import { dbRun, dbAll, dbGet, getNow, scopedNames } from './runtime';
const DINGTALK_OPEN = { APP_KEY: process.env.DINGTALK_APP_KEY, APP_SECRET: process.env.DINGTALK_APP_SECRET };

// Access Token 缓存（有效期 7200 秒，提前 5 分钟刷新）
let tokenCache = { token: null, expiresAt: 0 };

/**
 * 获取钉钉 Access Token（带缓存）
 */
async function getAccessToken() {
    const now = Date.now();
    if (tokenCache.token && now < tokenCache.expiresAt) {
        return tokenCache.token;
    }

    const { APP_KEY, APP_SECRET } = DINGTALK_OPEN;
    if (!APP_KEY || !APP_SECRET) {
        throw new Error('钉钉开放平台未配置 APP_KEY / APP_SECRET');
    }

    const url = `https://oapi.dingtalk.com/gettoken?appkey=${encodeURIComponent(APP_KEY)}&appsecret=${encodeURIComponent(APP_SECRET)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.errcode !== 0) {
        throw new Error(`获取钉钉 token 失败: ${data.errmsg}`);
    }

    tokenCache.token = data.access_token;
    tokenCache.expiresAt = now + (data.expires_in - 300) * 1000; // 提前5分钟过期
    return data.access_token;
}

/**
 * 调用钉钉开放平台 API
 */
async function callDingTalkAPI(path, body = {}, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const token = await getAccessToken();
            const url = `https://oapi.dingtalk.com${path}?access_token=${token}`;

            if (attempt === 1) console.log(`[钉钉API] 调用: ${path}`);
            else console.log(`[钉钉API] 重试(${attempt}/${retries}): ${path}`);

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const data = await res.json();

            if (data.errcode !== 0) {
                console.error(`[钉钉API] 错误: ${path}`, {
                    errcode: data.errcode,
                    errmsg: data.errmsg,
                });
                // 部分错误码可以重试（如限流、服务繁忙）
                if (attempt < retries && [88, -1, 90018].includes(data.errcode)) {
                    const delay = attempt * 2000;
                    console.log(`[钉钉API] ${delay}ms 后重试...`);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }
            }

            return data;
        } catch (e) {
            console.error(`[钉钉API] 网络异常(${attempt}/${retries}): ${path}`, e.message);
            if (attempt < retries) {
                const delay = attempt * 2000;
                console.log(`[钉钉API] ${delay}ms 后重试...`);
                await new Promise(r => setTimeout(r, delay));
            } else {
                throw e;
            }
        }
    }
}

/**
 * 获取所有部门列表（递归）
 */
async function getAllDepartments(parentId = 1) {
    const result = [];
    const data = await callDingTalkAPI('/topapi/v2/department/listsub', { dept_id: parentId });
    if (data.errcode === 0 && data.result) {
        for (const dept of data.result) {
            result.push({ dept_id: dept.dept_id, name: dept.name, parent_id: parentId });
            // 递归获取子部门
            const children = await getAllDepartments(dept.dept_id);
            result.push(...children);
        }
    }
    return result;
}

/**
 * 获取部门下所有用户（分页）
 */
async function getDepartmentUsers(deptId) {
    const users = [];
    let cursor = 0;
    let hasMore = true;

    while (hasMore) {
        const data = await callDingTalkAPI('/topapi/user/listsimple', {
            dept_id: deptId,
            cursor,
            size: 50
        });

        if (data.errcode === 0 && data.result && data.result.list) {
            users.push(...data.result.list);
            hasMore = data.result.has_more;
            cursor = data.result.next_cursor || 0;
        } else {
            console.warn(`[钉钉API] 部门${deptId} 获取失败:`, data.errmsg || '未知错误');
            hasMore = false;
        }
    }
    return users;
}

/**
 * 获取所有用户（去重）
 */
async function getAllUsers() {
    const departments = await getAllDepartments();
    const userMap = new Map();

    for (const dept of departments) {
        const users = await getDepartmentUsers(dept.dept_id);
        for (const u of users) {
            if (userMap.has(u.userid)) {
                // 添加部门ID到列表
                const existing = userMap.get(u.userid);
                if (!existing.dept_ids.includes(String(dept.dept_id))) {
                    existing.dept_ids.push(String(dept.dept_id));
                }
            } else {
                userMap.set(u.userid, { 
                    userid: u.userid,
                    unionid: u.unionid,
                    name: u.name, 
                    dept_ids: [String(dept.dept_id)],
                    dept_name: dept.name // 主部门名称
                });
            }
        }
    }
    return Array.from(userMap.values());
}

/**
 * 获取用户某日考勤数据
 * 使用 getupdatedata 接口（已验证可用）
 */
async function getUserAttendance(userid, workDate) {
    const data = await callDingTalkAPI('/topapi/attendance/getupdatedata', {
        userid,
        work_date: workDate
    });
    return data;
}

/**
 * 批量同步考勤数据到数据库
 * @param {sqlite3.Database} db
 * @param {string} workDate - YYYY-MM-DD
 * @returns {Object} { synced, failed, skipped }
 */
async function syncAttendanceData(db, workDate) {


    // 1. 获取所有用户
    const users = (await getAllUsers()).filter(user => scopedNames([user.name]).length);
    console.log(`📋 [考勤同步] 获取到 ${users.length} 位员工`);

    let synced = 0, failed = 0, skipped = 0;

    for (let i = 0; i < users.length; i++) {
        const user = users[i];
        // 每请求间隔 60ms，避免触发钉钉 QPS 限流（20次/秒）
        if (i > 0) await new Promise(r => setTimeout(r, 60));
        try {
            const data = await getUserAttendance(user.userid, workDate);
            if (data.errcode !== 0) {
                console.warn(`⚠️ [考勤] ${user.name} 数据获取失败: ${data.errmsg}`);
                failed++;
                continue;
            }

            const resultList = data.result?.attendance_result_list || [];
            if (resultList.length === 0) {
                skipped++;
                continue;
            }

            // 解析考勤结果（attendance_result_list 格式）
            const record = parseAttendanceResult(resultList);

            // 写入数据库（UPSERT）
            await dbRun(db, `
                INSERT INTO attendance_records (
                    dingtalk_userid, name, dept_name, work_date,
                    on_duty_time, off_duty_time, on_duty_result, off_duty_result,
                    on_duty_location, off_duty_location,
                    late_minutes, early_leave_minutes, work_duration,
                    absent_days, attendance_days, rest_days,
                    all_check_times, raw_data, synced_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(dingtalk_userid, work_date) DO UPDATE SET
                    name = excluded.name,
                    dept_name = excluded.dept_name,
                    on_duty_time = excluded.on_duty_time,
                    off_duty_time = excluded.off_duty_time,
                    on_duty_result = excluded.on_duty_result,
                    off_duty_result = excluded.off_duty_result,
                    on_duty_location = excluded.on_duty_location,
                    off_duty_location = excluded.off_duty_location,
                    late_minutes = excluded.late_minutes,
                    early_leave_minutes = excluded.early_leave_minutes,
                    work_duration = excluded.work_duration,
                    absent_days = excluded.absent_days,
                    attendance_days = excluded.attendance_days,
                    rest_days = excluded.rest_days,
                    all_check_times = excluded.all_check_times,
                    raw_data = excluded.raw_data,
                    synced_at = excluded.synced_at
            `, [
                user.userid, user.name, user.dept_name, workDate,
                record.on_duty_time, record.off_duty_time,
                record.on_duty_result, record.off_duty_result,
                record.on_duty_location, record.off_duty_location,
                record.late_minutes, record.early_leave_minutes,
                record.work_duration, record.absent_days,
                record.attendance_days, record.rest_days,
                JSON.stringify(record.all_check_times),
                JSON.stringify(data.result), getNow()
            ]);
            synced++;
        } catch (e) {
            console.error(`❌ [考勤] ${user.name} 同步异常:`, e.message);
            failed++;
        }
    }

    console.log(`✅ [考勤同步] ${workDate} 完成: 同步${synced}人, 跳过${skipped}人, 失败${failed}人`);
    return { synced, failed, skipped, total: users.length };
}

/**
 * 解析钉钉 attendance_result_list 格式的考勤数据
 * 策略：不依赖 check_type 分类（API 多班次分类不可靠），
 *       直接取所有打卡时间的第一次作为上班、最后一次作为下班
 */
function parseAttendanceResult(resultList) {
    const record = {
        on_duty_time: null,
        off_duty_time: null,
        on_duty_result: null,
        off_duty_result: null,
        on_duty_location: null,
        off_duty_location: null,
        late_minutes: 0,
        early_leave_minutes: 0,
        work_duration: null,
        absent_days: 0,
        attendance_days: 0,
        rest_days: 0,
        all_check_times: []
    };

    // 收集所有有效打卡记录，按时间排序
    const allRecords = [];
    for (const item of resultList) {
        const checkTime = item.user_check_time || '';
        const timeStr = checkTime.includes(' ') ? checkTime.split(' ')[1] : checkTime;
        if (timeStr) {
            allRecords.push({ timeStr, item });
        }
    }

    if (allRecords.length === 0) return record;

    // 按时间升序排序
    allRecords.sort((a, b) => a.timeStr.localeCompare(b.timeStr));

    // 去重收集所有打卡时间
    record.all_check_times = [...new Set(allRecords.map(r => r.timeStr))];

    // 区分凌晨打卡（06:00前，通常是前一天下班卡）和正常打卡
    const EARLY_THRESHOLD = '06:00:00';
    const daytimeRecords = allRecords.filter(r => r.timeStr >= EARLY_THRESHOLD);
    const earlyRecords = allRecords.filter(r => r.timeStr < EARLY_THRESHOLD);

    // 上班打卡：优先取 06:00 后的第一次；如果全是凌晨打卡才取最早
    const onDutySource = daytimeRecords.length > 0 ? daytimeRecords : allRecords;
    const first = onDutySource[0];
    record.on_duty_time = first.timeStr;
    record.on_duty_location = first.item.user_address || null;

    // 下班打卡：取白天打卡中最晚的，且必须与上班不同
    if (daytimeRecords.length >= 2) {
        const last = daytimeRecords[daytimeRecords.length - 1];
        if (last.timeStr !== first.timeStr) {
            record.off_duty_time = last.timeStr;
            record.off_duty_location = last.item.user_address || null;
        }
    } else if (daytimeRecords.length === 0 && allRecords.length >= 2) {
        // 全是凌晨打卡（夜班场景），取最晚的
        const last = allRecords[allRecords.length - 1];
        if (last.timeStr !== first.timeStr) {
            record.off_duty_time = last.timeStr;
            record.off_duty_location = last.item.user_address || null;
        }
    }

    // 从原始分类中提取考勤结果（迟到/早退等状态仍参考 API 判定）
    for (const item of resultList) {
        if (item.check_type === 'OnDuty' && item.time_result) {
            // 取第一个 OnDuty 的考勤结果
            if (!record.on_duty_result) {
                record.on_duty_result = item.time_result;
                const planTime = item.plan_check_time || '';
                const planTimeStr = planTime.includes(' ') ? planTime.split(' ')[1] : planTime;
                if (item.time_result === 'Late' || item.time_result === 'SeriousLate') {
                    record.late_minutes = calcMinutesDiff(planTimeStr, record.on_duty_time);
                }
            }
        } else if (item.check_type === 'OffDuty' && item.time_result) {
            // 取最后一个 OffDuty 的考勤结果
            record.off_duty_result = item.time_result;
            const planTime = item.plan_check_time || '';
            const planTimeStr = planTime.includes(' ') ? planTime.split(' ')[1] : planTime;
            if (item.time_result === 'Early') {
                record.early_leave_minutes = calcMinutesDiff(record.off_duty_time, planTimeStr);
            }
        }
    }

    // 默认结果
    if (!record.on_duty_result) record.on_duty_result = 'Normal';
    if (record.off_duty_time && !record.off_duty_result) record.off_duty_result = 'Normal';

    // 计算工作时长
    if (record.on_duty_time && record.off_duty_time) {
        const mins = calcMinutesDiff(record.on_duty_time, record.off_duty_time);
        if (mins > 0) {
            const hours = Math.floor(mins / 60);
            const remain = mins % 60;
            record.work_duration = `${hours}小时${remain > 0 ? remain + '分钟' : ''}`;
        }
    }

    return record;
}

/**
 * 计算两个时间字符串之间的分钟差（HH:mm:ss 格式）
 */
function calcMinutesDiff(earlier, later) {
    try {
        const [h1, m1] = earlier.split(':').map(Number);
        const [h2, m2] = later.split(':').map(Number);
        return (h2 * 60 + m2) - (h1 * 60 + m1);
    } catch (e) {
        return 0;
    }
}

// ==========================================
// 审批数据同步
// ==========================================

const APPROVAL_PROCESS_CODES = {
    leave:          'PROC-B2D15196-6E24-4237-ADE1-0490C7DECEA1',  // 请假
    repair_check:   'PROC-BF190E49-6749-4737-8836-4207BDEAC13B',  // 补卡
    go_out:         'PROC-56F552CA-1E90-4534-9969-F854C6AE2310',  // 外出
    overtime:       'PROC-2C444C58-C7B9-4E8F-AD23-F1AF66DB5EA7',  // 加班
    business_trip:  'PROC-073B4789-6D3B-4980-91E3-58656D564B9C',  // 出差
    cannot_stream:  'PROC-2C3D4BCD-D1FE-4693-BA00-898F8F7766B7',  // 无法开播同步
};

const APPROVAL_TYPE_LABELS = {
    leave: '请假', repair_check: '补卡', go_out: '外出',
    overtime: '加班', business_trip: '出差', cannot_stream: '无法开播'
};

/**
 * 获取审批实例ID列表（分页）
 */
async function getApprovalInstanceIds(processCode, startTime, endTime) {
    const ids = [];
    let cursor = 0;
    let hasMore = true;

    while (hasMore) {
        const data = await callDingTalkAPI('/topapi/processinstance/listids', {
            process_code: processCode,
            start_time: startTime,
            end_time: endTime || Date.now(),
            size: 20,
            cursor
        });
        if (data.errcode === 0 && data.result?.list) {
            ids.push(...data.result.list);
            cursor = ids.length;
            hasMore = data.result.list.length === 20;
        } else {
            hasMore = false;
        }
        // 避免触发限流
        await new Promise(r => setTimeout(r, 100));
    }
    return ids;
}

/**
 * 获取审批实例详情
 */
async function getApprovalInstanceDetail(instanceId) {
    const data = await callDingTalkAPI('/topapi/processinstance/get', {
        process_instance_id: instanceId
    });
    if (data.errcode === 0 && data.process_instance) {
        return data.process_instance;
    }
    return null;
}

/**
 * 解析审批表单字段，提取结构化数据
 * 不同审批类型的表单字段名不同，做宽松匹配
 */
function parseApprovalForm(approvalType, formValues) {
    const result = { start_time: null, end_time: null, duration_hours: null, reason: null, leave_type: null };
    if (!formValues || !Array.isArray(formValues)) return result;

    for (const field of formValues) {
        const nameRaw = field.name || '';
        const name = (typeof nameRaw === 'string' ? nameRaw : JSON.stringify(nameRaw)).toLowerCase();
        const value = field.value || '';

        // DDHolidayField/DDGooutField: 请假/外出组件
        // value 格式为 ["开始时间","结束时间",数值,"halfDay/hour","假别/空","类型"]
        if (field.component_type === 'DDHolidayField' || field.component_type === 'DDGooutField') {
            try {
                const arr = JSON.parse(value);
                if (Array.isArray(arr) && arr.length >= 3) {
                    result.start_time = arr[0] || null;
                    result.end_time = arr[1] || null;
                    const num = parseFloat(arr[2]);
                    if (!isNaN(num)) {
                        // halfDay/fullDay 按天算，hour 按小时算
                        const unit = arr[3] || '';
                        result.duration_hours = unit === 'hour' ? num : num * 8;
                    }
                    if (arr[4]) result.leave_type = arr[4]; // 假别（请假时有值）
                }
            } catch (e) {}
            continue;
        }

        // DDBizSuite: 外出/加班/出差/补卡等嵌套组件
        if (field.component_type === 'DDBizSuite') {
            try {
                const nested = JSON.parse(value);
                if (Array.isArray(nested)) {
                    for (const item of nested) {
                        const alias = (item.props?.bizAlias || '').toLowerCase();
                        const label = (item.props?.label || '').toLowerCase();
                        const val = item.value || '';
                        if (alias === 'starttime' || alias === 'start_time' || label.includes('开始')) {
                            result.start_time = val;
                        } else if (alias === 'finishtime' || alias === 'finish_time' || alias === 'endtime' || label.includes('结束')) {
                            result.end_time = val;
                        } else if (alias === 'duration' || label.includes('时长')) {
                            const num = parseFloat(val);
                            if (!isNaN(num)) result.duration_hours = num;
                        } else if (alias === 'userchecktime' || label.includes('补卡时间')) {
                            // 补卡组件：value 为补卡时间如 "2026-02-22 19:00"
                            // extValue 含 workDate（工作日时间戳）和 planTip
                            result.repair_check_time = val;
                            result.start_time = val; // 补卡日期 = 补卡时间的日期
                            result.end_time = val;
                            try {
                                const ext = JSON.parse(item.extValue || '{}');
                                if (ext.planTip) result.reason = ext.planTip;
                            } catch (e2) {}
                        }
                    }
                }
            } catch (e) {}
            continue;
        }

        // 普通字段匹配
        if (name.includes('开始时间') || name === '开始') {
            result.start_time = value;
        } else if (name.includes('结束时间') || name === '结束') {
            result.end_time = value;
        } else if (name.includes('时长') || name.includes('天数')) {
            const num = parseFloat(value);
            if (!isNaN(num)) result.duration_hours = num;
        } else if (name.includes('事由') || name.includes('原因') || name.includes('备注') || name.includes('说明')) {
            result.reason = value;
        } else if (name.includes('请假类型') || name.includes('假别')) {
            result.leave_type = value;
        } else if (name === 'repairchecktime' || name.includes('补卡时间')) {
            // repairCheckTime 普通字段，ext_value 里有 workDate/planText
            if (!result.start_time && value) {
                // value 可能是时间戳字符串，尝试从 ext_value 里拿
                try {
                    const ext = JSON.parse(field.ext_value || '{}');
                    if (ext.planText) {
                        // planText 如 "2026-02-22 19:00"
                        const match = ext.planText.match(/\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/);
                        if (match) {
                            result.start_time = match[0];
                            result.end_time = match[0];
                            result.repair_check_time = match[0];
                        }
                    }
                } catch (e) {}
            }
        }
    }

    return result;
}

/**
 * 批量同步审批数据
 * @param {sqlite3.Database} db
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @param {string[]} types - 要同步的类型，默认全部
 */
async function syncApprovalData(db, startDate, endDate, types) {


    const typesToSync = types || Object.keys(APPROVAL_PROCESS_CODES);
    const startTime = new Date(startDate).getTime();
    const endTime = new Date(endDate + ' 23:59:59').getTime();

    // 预加载用户名映射（从已有考勤记录）
    const userRows = await dbAll(db, 'SELECT DISTINCT dingtalk_userid, name, dept_name FROM attendance_records');
    const userMap = new Map(userRows.map(r => [r.dingtalk_userid, r]));

    // 如果映射不全，补充从钉钉获取
    let allUsersCache = null;
    async function getUserInfo(userid) {
        const cached = userMap.get(userid);
        if (cached) return cached;
        if (!allUsersCache) {
            allUsersCache = await getAllUsers();
            for (const u of allUsersCache) {
                if (!userMap.has(u.userid)) {
                    userMap.set(u.userid, { dingtalk_userid: u.userid, name: u.name, dept_name: u.dept_name });
                }
            }
        }
        return userMap.get(userid) || { name: userid, dept_name: '' };
    }

    let totalSynced = 0, totalFailed = 0, totalSkipped = 0;

    for (const type of typesToSync) {
        const code = APPROVAL_PROCESS_CODES[type];
        if (!code) continue;

        const label = APPROVAL_TYPE_LABELS[type];
        console.log(`📋 [审批同步] 获取${label}实例列表...`);

        const ids = await getApprovalInstanceIds(code, startTime, endTime);
        console.log(`   找到 ${ids.length} 条${label}记录`);

        for (const instanceId of ids) {
            try {
                // 检查是否已同步（且状态已完成）
                const existing = await dbGet(db, 'SELECT status FROM approval_instances WHERE instance_id = ?', [instanceId]);
                if (existing && existing.status === 'COMPLETED') {
                    totalSkipped++;
                    continue;
                }

                const detail = await getApprovalInstanceDetail(instanceId);
                if (!detail) { totalFailed++; continue; }

                const userInfo = await getUserInfo(detail.originator_userid);
                if (!scopedNames([userInfo.name]).length) { totalSkipped++; continue; }
                const formData = parseApprovalForm(type, detail.form_component_values);

                // 补卡类型：将补卡时间存入 leave_type 字段方便前端展示
                if (type === 'repair_check' && formData.repair_check_time) {
                    formData.leave_type = formData.repair_check_time;
                }

                await dbRun(db, `
                    INSERT INTO approval_instances (
                        instance_id, process_code, approval_type, title,
                        originator_userid, originator_name, dept_name,
                        status, result, start_time, end_time,
                        duration_hours, reason, leave_type,
                        form_data, create_time, finish_time, synced_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(instance_id) DO UPDATE SET
                        status = excluded.status,
                        result = excluded.result,
                        start_time = excluded.start_time,
                        end_time = excluded.end_time,
                        duration_hours = excluded.duration_hours,
                        reason = excluded.reason,
                        leave_type = excluded.leave_type,
                        finish_time = excluded.finish_time,
                        synced_at = excluded.synced_at
                `, [
                    instanceId, code, type, detail.title || '',
                    detail.originator_userid, userInfo.name, userInfo.dept_name,
                    detail.status || 'UNKNOWN', detail.result || null,
                    formData.start_time, formData.end_time,
                    formData.duration_hours, formData.reason, formData.leave_type,
                    JSON.stringify(detail.form_component_values),
                    detail.create_time, detail.finish_time, getNow()
                ]);

                // 无法开播审批已通过 → 自动写入 anchor_attendance_notes
                if (type === 'cannot_stream' && detail.result === 'agree') {
                    // start_time 可能是 JSON 数组格式 ["2026-03-05","2026-03-09",5] 或普通日期字符串
                    let startDay = '', endDay = '';
                    try {
                        const arr = JSON.parse(formData.start_time);
                        if (Array.isArray(arr) && arr.length >= 2) {
                            startDay = arr[0]; endDay = arr[1];
                        }
                    } catch (e) {
                        startDay = (formData.start_time || '').slice(0, 10);
                        endDay = (formData.end_time || startDay).slice(0, 10);
                    }
                    if (startDay) {
                        const sd = new Date(startDay);
                        const ed = endDay ? new Date(endDay) : sd;
                        for (let d = new Date(sd); d <= ed; d.setDate(d.getDate() + 1)) {
                            const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                            await dbRun(db, `
                                INSERT INTO anchor_attendance_notes (anchor_name, note_date, note_type, content, created_by, created_at)
                                VALUES (?, ?, 'cannot_stream', ?, '钉钉审批同步', ?)
                                ON CONFLICT(anchor_name, note_date, note_type) DO UPDATE SET
                                    content = excluded.content, created_by = excluded.created_by, created_at = excluded.created_at
                            `, [userInfo.name, ds, formData.reason || '无法开播', getNow()]);
                        }
                    }
                }

                totalSynced++;
            } catch (e) {
                console.error(`❌ [审批] ${instanceId} 同步异常:`, e.message);
                totalFailed++;
            }
            await new Promise(r => setTimeout(r, 50));
        }
    }

    console.log(`✅ [审批同步] 完成: 同步${totalSynced}条, 跳过${totalSkipped}条, 失败${totalFailed}条`);
    return { synced: totalSynced, failed: totalFailed, skipped: totalSkipped, total: totalSynced + totalFailed + totalSkipped };
}

// ==========================================
// 充值审批同步
// ==========================================


export { getAccessToken, getAllDepartments, getAllUsers, getUserAttendance, syncAttendanceData, APPROVAL_PROCESS_CODES, APPROVAL_TYPE_LABELS, syncApprovalData };
