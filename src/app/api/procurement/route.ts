import { NextResponse } from "next/server";
import { createProcurement, listProcurement, procurementStats } from "@/modules/procurement";
import { isAppError } from "@/lib/errors";
export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    return NextResponse.json({
      items: await listProcurement({
        status: u.searchParams.get("status") ?? undefined,
        search: u.searchParams.get("search") ?? undefined,
      }),
      stats: await procurementStats(),
    });
  } catch (e) {
    return NextResponse.json(
      isAppError(e) ? e.toJSON() : { error: { message: "加载采购数据失败" } },
      { status: isAppError(e) ? e.httpStatus : 500 },
    );
  }
}
export async function POST(req: Request) {
  try {
    return NextResponse.json(await createProcurement(await req.json()), { status: 201 });
  } catch (e) {
    return NextResponse.json(
      isAppError(e) ? e.toJSON() : { error: { message: "提交采购申请失败" } },
      { status: isAppError(e) ? e.httpStatus : 500 },
    );
  }
}
