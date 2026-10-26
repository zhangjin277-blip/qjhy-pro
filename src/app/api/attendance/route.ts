import { dispatch } from "@/modules/attendance/pro3/server/dispatch";
export const runtime = "nodejs";
// Compatibility entry point: all attendance reads and writes use the PRO3 store.
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.has("start")) url.searchParams.set("start_date", url.searchParams.get("start")!);
  if (url.searchParams.has("end")) url.searchParams.set("end_date", url.searchParams.get("end")!);
  if (url.searchParams.has("search")) url.searchParams.set("name", url.searchParams.get("search")!);
  return dispatch(new Request(url, { method: "GET" }), ["attendance", "records"]);
}
export async function POST(request: Request) {
  const body = await request.json();
  return dispatch(new Request(request.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ work_date: body.work_date ?? body.workDate }) }), ["attendance", "sync"]);
}
