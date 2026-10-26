import { dispatch } from "@/modules/attendance/pro3/server/dispatch";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
async function handler(request: Request, context: Context) {
  return dispatch(request, (await context.params).path);
}
export { handler as GET, handler as POST, handler as PUT, handler as DELETE };
