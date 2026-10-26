import { getWorkbench } from "@/modules/dashboard/server";
import { AppError } from "@/lib/errors";

export async function GET(): Promise<Response> {
  try {
    return Response.json(await getWorkbench(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof AppError ? error.message : "工作台加载失败" },
      { status: error instanceof AppError ? error.httpStatus : 500 },
    );
  }
}
