import { procurementAnchorOptions } from "@/modules/procurement/anchor-options";
import { isAppError } from "@/lib/errors";
import { requireProcurementAccess } from "@/modules/procurement/server";

export async function GET() {
  try {
    await requireProcurementAccess();
    const anchors = await procurementAnchorOptions();
    return Response.json({ anchors });
  } catch (e) {
    return Response.json(isAppError(e) ? e.toJSON() : { error: { message: "加载主播列表失败" } }, {
      status: isAppError(e) ? e.httpStatus : 500,
    });
  }
}
