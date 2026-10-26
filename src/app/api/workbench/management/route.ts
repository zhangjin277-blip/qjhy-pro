import { getManagementWorkbench } from "@/modules/dashboard/server";
import { AppError } from "@/lib/errors";
export async function GET() {
  try {
    return Response.json(await getManagementWorkbench(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof AppError ? error.message : "管理概览加载失败" },
      { status: error instanceof AppError ? error.httpStatus : 500 },
    );
  }
}
