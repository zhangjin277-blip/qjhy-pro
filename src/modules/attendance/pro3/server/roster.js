import 'server-only';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dbAll, getToday } from './runtime';

export const ROSTER_NODE = 'np9zOoBVByjjxwMQSnRzEXgjW1DK0g6l';
const PROFILE = 'dingfe99581e9ca94e8da1320dcb25e91351:0526301817793094';
const exec = promisify(execFile);

async function dws(args) {
    let output;
    try {
        const result = await exec(process.env.DINGTALK_ROSTER_DWS_BIN || 'dws', [...args, '--profile', PROFILE, '--format', 'json'], {
            timeout: 120000, maxBuffer: 8 * 1024 * 1024,
        });
        output = JSON.parse(result.stdout);
    } catch (error) {
        // CLI 错误可能包含认证上下文，只返回固定诊断，不向页面或日志回显凭据。
        if (error.code === 'ENOENT') throw new Error('排班表读取服务未安装，请配置钉钉文档读取环境');
        throw new Error('钉钉排班表读取失败，请检查该组织文档授权和网络；上次排班数据保留');
    }
    if (output.success === false || output.ok === false || output.hasMore) throw new Error('排班表未完整读取，保留上次排班数据');
    return output.data ?? output;
}

// csv-get 的每个逻辑行带 [row=N]；CSV 字段可能包含引号、逗号和换行。
export function parseRosterCsv(text) {
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
            if (quoted && text[i + 1] === '"') { field += '"'; i++; }
            else quoted = !quoted;
        } else if (!quoted && (char === ',' || char === '\n')) {
            row.push(field.replace(/\r$/, '')); field = '';
            if (char === '\n') { rows.push(row); row = []; }
        } else field += char;
    }
    if (quoted) throw new Error('排班表 CSV 不完整');
    if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
    return rows.map(cells => {
        if (!/^\[row=\d+\] /.test(cells[0] || '')) throw new Error('排班表行号信息缺失');
        return cells.map((value, index) => (index === 0 ? value.replace(/^\[row=\d+\] /, '') : value).trim());
    });
}

export function parseRosterRows(rows, month) {
    const header = rows.findIndex(row => row.includes('用户ID') && row.includes('姓名'));
    if (header < 0) throw new Error('排班表缺少用户ID或姓名表头');
    const columns = rows[header];
    const idIndex = columns.indexOf('用户ID'), nameIndex = columns.indexOf('姓名'), deptIndex = columns.indexOf('部门');
    const dates = [];
    for (let index = 0; index < columns.length; index++) {
        const match = columns[index].match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\s|$)/);
        if (!match) continue;
        const date = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
        if (date.slice(0, 7) !== month || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('工作表日期与同步月份不一致');
        dates.push({ index, date });
    }
    const [year, mon] = month.split('-').map(Number);
    const dayCount = new Date(Date.UTC(year, mon, 0)).getUTCDate();
    if (dates.length !== dayCount || new Set(dates.map(d => d.date)).size !== dayCount) throw new Error('工作表缺少当月完整日期，保留上次排班数据');
    const records = [], seen = new Set();
    for (const row of rows.slice(header + 1)) {
        const userid = row[idIndex] || '', name = row[nameIndex] || '';
        if (!userid && !name) continue;
        if (!/^\d+$/.test(userid) || !name || seen.has(userid)) throw new Error('排班人员ID缺失、格式错误或重复，保留上次数据');
        seen.add(userid);
        for (const { index, date } of dates) {
            const value = row[index] || '';
            if (value && value !== '休' && !/^直播.+班\d*$/.test(value)) throw new Error(`排班表存在未识别班次“${value}”，请检查表格`);
            records.push({ userid, name, dept: row[deptIndex] || '', date, status: value === '休' ? 'rest' : value ? 'work' : 'unset', shift: value });
        }
    }
    if (!seen.size) throw new Error('排班表无有效人员，保留上次数据');
    return { records, people: seen.size, restDays: records.filter(r => r.status === 'rest').length };
}

export async function syncRoster(db, month = getToday().slice(0, 7), triggeredBy = 'cron:09:01') {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('月份格式无效');
    let sheetName = '';
    try {
        return await db.sql.begin(async sql => {
            const lock = await sql`SELECT pg_try_advisory_xact_lock(hashtext(${`attendance-roster:${ROSTER_NODE}:${month}`})) AS locked`;
            if (!lock[0].locked) throw new Error('该月排班正在同步，请稍后再试');
            const list = await dws(['sheet', '+list-sheets', '--node', ROSTER_NODE]);
            if (!Array.isArray(list.sheets) || list.count !== list.sheets.length) throw new Error('排班工作表目录未完整读取');
            const mon = Number(month.slice(5));
            const sheets = list.sheets.filter(sheet => new RegExp(`^排班表\\s*(?:${month.slice(0, 4)}年\\s*)?0?${mon}月$`).test(sheet.title));
            if (sheets.length !== 1) throw new Error(`没有唯一的${month}排班表，请检查底部月份工作表`);
            const sheet = sheets[0]; sheetName = sheet.title;
            const info = await dws(['sheet', 'info', '--node', ROSTER_NODE, '--sheet-id', sheet.sheetId]);
            const boundary = info.nonEmptyRange;
            if (!boundary || !Number.isInteger(boundary.lastRow) || boundary.lastRow > 2000 || !/^[A-Z]+$/.test(boundary.lastColumn)) throw new Error('排班工作表数据边界无效');
            const rows = [];
            for (let start = 1; start <= boundary.lastRow; start += 80) {
                const end = Math.min(start + 79, boundary.lastRow);
                const data = await dws(['sheet', 'csv-get', '--node', ROSTER_NODE, '--sheet-id', sheet.sheetId, '--range', `A${start}:${boundary.lastColumn}${end}`]);
                if (data.success !== true || data.hasMore !== false || data.truncationReasons?.length) throw new Error('排班数据被截断，保留上次数据');
                rows.push(...parseRosterCsv(data.csv));
            }
            const parsed = parseRosterRows(rows, month);
            await sql`DELETE FROM attendance_roster_days WHERE source_node=${ROSTER_NODE} AND work_date LIKE ${month + '-%'}`;
            const values = parsed.records.map(row => ({ source_node: ROSTER_NODE, dingtalk_userid: row.userid, name: row.name, dept_name: row.dept, work_date: row.date, status: row.status, shift_name: row.shift, sheet_id: sheet.sheetId }));
            for (let offset = 0; offset < values.length; offset += 1000) await sql`INSERT INTO attendance_roster_days ${sql(values.slice(offset, offset + 1000))}`;
            await sql`INSERT INTO attendance_roster_sync_log (source_node,month,sheet_name,people,rest_days,success,triggered_by) VALUES (${ROSTER_NODE},${month},${sheetName},${parsed.people},${parsed.restDays},true,${triggeredBy})`;
            return { month, sheetName, people: parsed.people, restDays: parsed.restDays };
        });
    } catch (error) {
        await db.sql`INSERT INTO attendance_roster_sync_log (source_node,month,sheet_name,success,message,triggered_by) VALUES (${ROSTER_NODE},${month},${sheetName},false,${error.message},${triggeredBy})`;
        throw error;
    }
}

export async function getRosterDays(db, start, end, name, userId) {
    return dbAll(db, `SELECT * FROM attendance_roster_days WHERE source_node=? AND work_date>=? AND work_date<=?${userId ? ' AND dingtalk_userid=?' : name ? ' AND name=?' : ''}`,
        [ROSTER_NODE, start, end, ...(userId ? [userId] : name ? [name] : [])]);
}

export function indexRoster(rows) {
    const byId = new Map(), byName = new Map();
    for (const row of rows) {
        byId.set(`${row.dingtalk_userid}_${row.work_date}`, row);
        const key = `${row.name}_${row.work_date}`;
        if (!byName.has(key)) byName.set(key, row);
        else if (byName.get(key)?.dingtalk_userid !== row.dingtalk_userid) byName.set(key, null);
    }
    return record => record.dingtalk_userid ? byId.get(`${record.dingtalk_userid}_${record.work_date}`) : byName.get(`${record.name}_${record.work_date}`);
}
