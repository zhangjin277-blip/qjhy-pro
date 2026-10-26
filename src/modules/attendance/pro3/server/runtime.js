import 'server-only';
import postgres from 'postgres';
import { AsyncLocalStorage } from 'node:async_hooks';
export const requestContext = new AsyncLocalStorage();
export const passThrough = (_req, _res, next) => next();
export const getNow = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date());
export const getToday = () => getNow().slice(0, 10);
export function scopedNames(names) { const user = requestContext.getStore(); return !user || user.allowedNames === null ? names : names.filter(name => user.allowedNames.includes(name)); }
function translate(sql) { let index = 0; return sql.replace(/datetime\('now','localtime'\)/gi, 'CURRENT_TIMESTAMP').replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP').replace(/\?(?![|&])/g, () => `$${++index}`); }
// 在数据库分页/聚合前按钉钉ID过滤，不能仅在返回后按姓名过滤。
function scopedQuery(statement, params) {
  const user = requestContext.getStore();
  const translated = translate(statement);
  if (!user || user.allowedUserIds === null || !user.allowedUserIds || !/^\s*(SELECT|WITH)\b/i.test(statement)) return { statement: translated, params };
  const tables = { attendance_records: 'dingtalk_userid', approval_instances: 'originator_userid', attendance_roster_days: 'dingtalk_userid' };
  const matched = Object.entries(tables).filter(([table]) => new RegExp(`\\b${table}\\b`, 'i').test(statement));
  if (!matched.length) return { statement: translated, params };
  const parameter = `$${params.length + 1}::text[]`;
  const ctes = matched.map(([table, field]) => `${table} AS (SELECT * FROM public.${table} WHERE ${field} = ANY(${parameter}))`).join(', ');
  const query = /^\s*WITH\s+RECURSIVE\b/i.test(translated)
    ? translated.replace(/^(\s*WITH\s+RECURSIVE)\s+/i, `$1 ${ctes}, `)
    : /^\s*WITH\b/i.test(translated) ? translated.replace(/^(\s*WITH)\s+/i, `$1 ${ctes}, `) : `WITH ${ctes} ${translated}`;
  return { statement: query, params: [...params, user.allowedUserIds] };
}
function scopeRows(sql, rows) {
  const user = requestContext.getStore();
  if (!user || user.allowedNames === null) return rows;
  if (!/\b(?:anchor_attendance_notes|anchor_daily_status)\b/i.test(sql)) return rows;
  return rows.filter(row => { const name = row.anchor_name ?? row.user_name ?? row.name; return name !== undefined && user.allowedNames.includes(name); });
}
let instance;
export function getDatabase() {
  if (instance) return instance;
  const sql = postgres(process.env.DATABASE_URL, { max: 5, idle_timeout: 20, connect_timeout: 10, prepare: false });
  instance = { async query(statement, params = []) { const scoped = scopedQuery(statement, params.map(value => value === undefined ? null : value)); const result = await sql.unsafe(scoped.statement, scoped.params); return scopeRows(statement, result); }, sql };
  return instance;
}
export const dbAll = (db, statement, params = []) => db.query(statement, params);
export const dbGet = async (db, statement, params = []) => (await db.query(statement, params))[0];
export const dbRun = (db, statement, params = []) => db.query(statement, params).then(rows => ({ changes: rows.count ?? rows.length ?? 0, lastID: rows[0]?.id }));
export function createRouter() { const routes = []; const router = { routes }; for (const method of ['get', 'post', 'put', 'delete']) router[method] = (pattern, ...handlers) => routes.push({ method: method.toUpperCase(), pattern, handler: handlers.at(-1) }); return router; }
