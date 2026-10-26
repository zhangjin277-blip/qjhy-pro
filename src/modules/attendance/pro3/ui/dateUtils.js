// src/utils/dateUtils.js
// 日期工具函数集合

/**
 * 将 Date 对象格式化为 YYYY-MM-DD 字符串
 * @param {Date} date - 日期对象
 * @returns {string} 格式化后的日期字符串
 */
export function toLocalDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * 将 Date 对象格式化为 YYYY-MM-DD HH:mm:ss 字符串
 * @param {Date} date - 日期对象
 * @returns {string} 格式化后的日期时间字符串
 */
export function toLocalDateTimeStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

/**
 * 获取今天的日期字符串 (YYYY-MM-DD)
 * @returns {string}
 */
export function getTodayStr() {
    return toLocalDateStr(new Date());
}

/**
 * 获取昨天的日期字符串 (YYYY-MM-DD)
 * @returns {string}
 */
export function getYesterdayStr() {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return toLocalDateStr(date);
}

/**
 * 获取N天前的日期字符串 (YYYY-MM-DD)
 * @param {number} days - 天数
 * @returns {string}
 */
export function getDaysAgoStr(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return toLocalDateStr(date);
}

/**
 * 获取本月第一天的日期字符串 (YYYY-MM-DD)
 * @returns {string}
 */
export function getMonthStartStr() {
    const date = new Date();
    date.setDate(1);
    return toLocalDateStr(date);
}

/**
 * 获取本月最后一天的日期字符串 (YYYY-MM-DD)
 * @returns {string}
 */
export function getMonthEndStr() {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    date.setDate(0);
    return toLocalDateStr(date);
}

/**
 * 解析日期字符串为 Date 对象
 * @param {string} dateStr - 日期字符串
 * @returns {Date}
 */
export function parseDate(dateStr) {
    return new Date(dateStr);
}

/**
 * 判断两个日期是否是同一天
 * @param {Date} date1
 * @param {Date} date2
 * @returns {boolean}
 */
export function isSameDay(date1, date2) {
    return toLocalDateStr(date1) === toLocalDateStr(date2);
}

/**
 * 计算两个日期之间的天数差
 * @param {Date} date1
 * @param {Date} date2
 * @returns {number}
 */
export function getDaysDiff(date1, date2) {
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.round(Math.abs((date1 - date2) / oneDay));
}

/**
 * 获取相对于今天偏移 N 天的日期字符串 (YYYY-MM-DD)
 * @param {number} offset - 偏移天数（负数为过去，正数为未来）
 * @returns {string}
 */
export function getDateStr(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().split('T')[0];
}

/**
 * 获取预设日期范围
 * @param {'today'|'yesterday'|'thisWeek'|'lastWeek'|'thisMonth'|'lastMonth'|'last7'|'last30'} type
 * @returns {{ start: string, end: string }}
 */
export function getDateRange(type) {
    const now = new Date();
    const today = toLocalDateStr(now);

    switch (type) {
        case 'today':
            return { start: today, end: today };
        case 'yesterday': {
            const y = getDateStr(-1);
            return { start: y, end: y };
        }
        case 'thisWeek': {
            const day = now.getDay() || 7;
            const monday = new Date(now);
            monday.setDate(now.getDate() - day + 1);
            return { start: toLocalDateStr(monday), end: today };
        }
        case 'lastWeek': {
            const day = now.getDay() || 7;
            const lastMonday = new Date(now);
            lastMonday.setDate(now.getDate() - day - 6);
            const lastSunday = new Date(lastMonday);
            lastSunday.setDate(lastMonday.getDate() + 6);
            return { start: toLocalDateStr(lastMonday), end: toLocalDateStr(lastSunday) };
        }
        case 'thisMonth':
            return { start: getMonthStartStr(), end: today };
        case 'lastMonth': {
            const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
            return { start: toLocalDateStr(firstOfLastMonth), end: toLocalDateStr(lastOfLastMonth) };
        }
        case 'last7':
            return { start: getDateStr(-6), end: today };
        case 'last30':
            return { start: getDateStr(-29), end: today };
        default:
            return { start: today, end: today };
    }
}
