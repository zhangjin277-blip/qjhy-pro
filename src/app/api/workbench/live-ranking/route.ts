import { AppError } from "@/lib/errors";
import { businessDate } from "@/lib/business-date";
import { getWorkbenchRanking } from "@/modules/dashboard/server";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const yesterday = new Date(`${businessDate()}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const defaultDate = yesterday.toISOString().slice(0, 10);
  try {
    return Response.json(
      await getWorkbenchRanking({
        project: params.get("project") ?? "ddz",
        metric: params.get("metric") ?? "flow",
        date_from: params.get("date_from") ?? defaultDate,
        date_to: params.get("date_to") ?? defaultDate,
      }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (!(error instanceof AppError)) console.error("[workbench:live-ranking] query failed");
    return Response.json(
      { error: error instanceof AppError ? error.message : "排行榜暂时无法加载，请重试" },
      {
        status: error instanceof AppError ? error.httpStatus : 500,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
