import { createRouter, dbGet, dbRun } from './runtime';
import { readDingtalkWorkSchedule } from './work-schedule';
export default function(db) {
  const router = createRouter();
  router.get('/work-settings/:name', async (req, res) => {
    const row = await dbGet(db, 'SELECT id, name, rest_day, work_start_time, work_end_time FROM users WHERE name = ?', [req.params.name]);
    const latest = await dbGet(db, `SELECT name, work_date, raw_data, synced_at FROM attendance_records
      WHERE name = ? AND raw_data IS NOT NULL AND raw_data != '' ORDER BY work_date DESC LIMIT 1`, [req.params.name]);
    const schedule = readDingtalkWorkSchedule(latest?.raw_data);
    res.json({ success: true, data: {
      ...(row || { rest_day: '0', work_start_time: '', work_end_time: '' }),
      dingtalk_start_time: schedule.start,
      dingtalk_end_time: schedule.end,
      dingtalk_schedule_date: latest?.work_date || '',
    } });
  });
  router.put('/work-settings/:name', async (req, res) => {
    const { rest_day, work_start_time, work_end_time } = req.body;
    if (rest_day !== undefined && !/^[0-7]$/.test(String(rest_day))) return res.status(400).json({ success: false, message: '休息日参数无效' });
    for (const time of [work_start_time, work_end_time]) if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return res.status(400).json({ success: false, message: '上下班时间格式无效' });
    const row = await dbGet(db, 'SELECT id, rest_day, work_start_time, work_end_time FROM users WHERE name = ?', [req.params.name]);
    const values = [String(rest_day ?? row?.rest_day ?? '0'), work_start_time ?? row?.work_start_time ?? '', work_end_time ?? row?.work_end_time ?? ''];
    if (row) await dbRun(db, "UPDATE users SET rest_day=?, work_start_time=?, work_end_time=?, updated_at=datetime('now','localtime') WHERE id=?", [...values, row.id]);
    else {
      const record = await dbGet(db, 'SELECT dingtalk_userid FROM attendance_records WHERE name=? ORDER BY work_date DESC LIMIT 1', [req.params.name]);
      await dbRun(db, "INSERT INTO users (username,name,password,role,status,rest_day,work_start_time,work_end_time,dingtalk_user_id) VALUES (?,?,'','user','active',?,?,?,?)", [`attendance:${req.params.name}`, req.params.name, ...values, record?.dingtalk_userid || '']);
    }
    if (db._workTimeCache) db._workTimeCache.expiresAt = 0;
    res.json({ success: true, message: '设置已保存' });
  });
  return router;
}
