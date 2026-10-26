// 钉钉 getupdatedata 的 plan_check_time 是计划时间，不能用实际打卡时间代替。
export function readDingtalkWorkSchedule(rawData) {
    let data;
    try { data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData; }
    catch { return { start: '', end: '' }; }
    const items = data?.attendance_result_list;
    if (!Array.isArray(items)) return { start: '', end: '' };
    const planned = items.map(item => {
        const value = item.plan_check_time;
        if (typeof value !== 'string') return null;
        const match = value.match(/^(\d{4}-\d{2}-\d{2})[ T]((?:[01]\d|2[0-3]):[0-5]\d)(?::[0-5]\d)?$/);
        return match ? { type: item.check_type, datetime: value, time: match[2] } : null;
    }).filter(Boolean).sort((a, b) => a.datetime.localeCompare(b.datetime));
    return {
        start: planned.find(item => item.type === 'OnDuty')?.time || '',
        end: planned.filter(item => item.type === 'OffDuty').at(-1)?.time || '',
    };
}
