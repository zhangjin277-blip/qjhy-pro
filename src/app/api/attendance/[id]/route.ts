import { dispatch } from "@/modules/attendance/pro3/server/dispatch";
export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const body = await request.json();
  const record_id = Number((await context.params).id);
  return dispatch(new Request(request.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ record_id, remark: String(body.remark ?? "") }) }), ["attendance", body.verified ? "verify" : "remark"]);
}
