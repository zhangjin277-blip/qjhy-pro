import 'server-only';
import attendanceRoutes from './attendance.routes';
import anchorRoutes from './anchor.routes';
import settingsRoutes from './settings.routes';
import { getDatabase, dbGet, requestContext } from './runtime';
import { attendanceActor } from '../access';
import { isAppError } from '@/lib/errors';
let registry;
function routes() {
  if (!registry) {
    const db = getDatabase();
    registry = [ ['attendance', attendanceRoutes(db)], ['anchor-dashboard', anchorRoutes(db)], ['user', settingsRoutes(db)] ]
      .flatMap(([prefix, router]) => router.routes.map(route => ({ ...route, pattern: `/${prefix}${route.pattern}` })));
  }
  return registry;
}
function requiredPoint(path, method) {
  if (/\/sync(?:-|$)|\/sync-log$/.test(path)) return 'sync';
  if (path.endsWith('/export')) return 'export';
  if (path.includes('/approvals')) return 'approval';
  if (method !== 'GET' || /\/pending-reviews$/.test(path)) return 'remark';
  return null;
}
export async function dispatch(request, segments) {
  try {
    const actor = await attendanceActor();
    const pathname = '/' + segments.join('/');
    const point = requiredPoint(pathname, request.method);
    if (point && !actor.permissions.includes(point)) return Response.json({ success: false, message: '没有此考勤操作权限' }, { status: 403 });
    let match, params;
    for (const route of routes()) {
      if (route.method !== request.method) continue;
      const keys = [];
      const expression = route.pattern.split('/').map(part => part.startsWith(':') ? (keys.push(part.slice(1)), '([^/]+)') : part).join('/');
      const result = pathname.match(new RegExp(`^${expression}$`));
      if (result) { match = route; params = Object.fromEntries(keys.map((key, index) => [key, result[index + 1]])); break; }
    }
    if (!match) return Response.json({ success: false, message: '接口不存在' }, { status: 404 });
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const calendarById = pathname === '/attendance/calendar' && query.user_id;
    if (calendarById && actor.user.allowedUserIds !== null && !actor.user.allowedUserIds.includes(query.user_id)) return Response.json({ success: false, message: '无权访问该成员的考勤' }, { status: 403 });
    const body = ['POST','PUT','DELETE'].includes(request.method) ? await request.json().catch(() => ({})) : {};
    const db = getDatabase();
    let target = (!calendarById && /\/(calendar|anchor-calendar|detail)$/.test(pathname) ? query.name : undefined) || body.anchor_name || body.target_anchor_name || params.name;
    if (body.record_id) target = (await dbGet(db, 'SELECT name FROM attendance_records WHERE id=?', [body.record_id]))?.name;
    if (body.target_user_id) target = (await dbGet(db, 'SELECT name FROM users WHERE id=?', [body.target_user_id]))?.name;
    if (pathname.includes('/anchor-note/') && params.id) target = (await dbGet(db, 'SELECT anchor_name FROM anchor_attendance_notes WHERE id=?', [params.id]))?.anchor_name;
    if (pathname.endsWith('/review-status') && body.id) target = (await dbGet(db, 'SELECT user_name FROM anchor_daily_status WHERE id=?', [body.id]))?.user_name;
    if (pathname.endsWith('/my-status') && !target) target = actor.user.name;
    if (target && actor.user.allowedNames !== null && !actor.user.allowedNames.includes(target)) return Response.json({ success: false, message: '无权访问该成员的考勤' }, { status: 403 });
    return await requestContext.run(actor.user, async () => {
      let status = 200; const headers = new Headers({ 'Cache-Control': 'no-store' }); let response;
      const res = {
        status(code) { status = code; return this; },
        setHeader(key, value) { headers.set(key, value); },
        json(data) { response = Response.json(data, { status, headers }); return response; },
        send(data) { response = new Response(new Uint8Array(data), { status, headers }); return response; },
      };
      await match.handler({ user: actor.user, query, body, params }, res);
      return response || Response.json({ success: false, message: '接口未返回结果' }, { status: 500 });
    });
  } catch (error) {
    if (isAppError(error)) return Response.json(error.toJSON(), { status: error.httpStatus });
    console.error('[attendance-pro3]', error.message);
    return Response.json({ success: false, message: '考勤处理失败，请检查本地考勤库配置' }, { status: 500 });
  }
}
