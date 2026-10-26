import { getPersonalCalendar } from "@/modules/dashboard/server";
import { businessDate } from "@/lib/business-date";
import { AppError } from "@/lib/errors";
export async function GET(request: Request) {
  try {
    return Response.json(
      await getPersonalCalendar(
        new URL(request.url).searchParams.get("month") || businessDate().slice(0, 7),
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof AppError ? error.message : "个人考勤加载失败" },
      { status: error instanceof AppError ? error.httpStatus : 500 },
    );
  }
}
