import { z, ZodError } from "zod";
import { AppError } from "@/lib/errors";
import { isTrustedOrigin } from "@/lib/auth/trusted-origins";
import {
  goalHistory,
  listGoals,
  mutateGoal,
  sourceOptions,
  previewGoal,
  saveGoalMetrics,
  mutateGoalGroup,
  splitTeamGoals,
  personalTeamOptions,
  savePersonalGoals,
  publishTeamGoals,
} from "@/modules/goals/server";

const headers = { "Cache-Control": "private, no-store" };
function errorResponse(error: unknown) {
  const message =
    error instanceof AppError
      ? error.message
      : error instanceof ZodError
        ? error.issues[0]?.message
        : "目标操作失败，请稍后重试";
  if (
    !(error instanceof AppError) &&
    !(error instanceof ZodError) &&
    !(error instanceof SyntaxError)
  )
    console.error("[goals] request failed");
  return Response.json(
    { error: message },
    {
      status:
        error instanceof AppError
          ? error.httpStatus
          : error instanceof ZodError || error instanceof SyntaxError
            ? 400
            : 500,
      headers,
    },
  );
}
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    if (query.has("personal-teams"))
      return Response.json(
        {
          items: await personalTeamOptions({
            period: query.get("period"),
            project: query.get("project"),
            dept_id: query.get("dept") || null,
            owner_id: query.get("owner"),
            team_id: query.get("team") || null,
            source_product: query.get("dataset") || null,
          }),
        },
        { headers },
      );
    if (query.has("source"))
      return Response.json(
        await sourceOptions(
          query.get("source") ?? "",
          query.get("product") ?? "",
          query.get("dept"),
        ),
        { headers },
      );
    if (query.has("history"))
      return Response.json({ items: await goalHistory(query.get("history") ?? "") }, { headers });
    return Response.json(
      await listGoals(query.get("period") ?? undefined, query.get("home") === "1"),
      { headers },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    if (!isTrustedOrigin(request.headers.get("origin")))
      throw new AppError("GOALS_ORIGIN", "请求来源不合法", 403);
    if (Number(request.headers.get("content-length") ?? 0) > 400000)
      throw new AppError("GOALS_SIZE", "请求内容过大", 413);
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 400000)
      throw new AppError("GOALS_SIZE", "请求内容过大", 413);
    const input: unknown = JSON.parse(body);
    if (
      typeof input === "object" &&
      input !== null &&
      "action" in input &&
      input.action === "publish-team"
    )
      return Response.json({ items: await publishTeamGoals(input) }, { headers });
    if (
      typeof input === "object" &&
      input !== null &&
      "action" in input &&
      input.action === "save-personal-goals"
    )
      return Response.json({ items: await savePersonalGoals(input) }, { headers });
    if (
      typeof input === "object" &&
      input !== null &&
      "action" in input &&
      input.action === "split-goals"
    )
      return Response.json({ items: await splitTeamGoals(input) }, { headers });
    if (
      typeof input === "object" &&
      input !== null &&
      "action" in input &&
      input.action === "save-metrics"
    )
      return Response.json({ items: await saveGoalMetrics(input) }, { headers });
    if (
      typeof input === "object" &&
      input !== null &&
      "action" in input &&
      (input.action === "edit-group" || input.action === "close-group")
    )
      return Response.json({ items: await mutateGoalGroup(input) }, { headers });
    const preview =
      typeof input === "object" && input !== null && "action" in input && input.action === "preview"
        ? z
            .object({
              action: z.literal("preview"),
              definition: z.unknown(),
              mode: z.enum(["current", "comparison", "previous"]).optional(),
            })
            .strict()
            .parse(input)
        : null;
    return Response.json(
      {
        item: preview
          ? await previewGoal(preview.definition, preview.mode)
          : await mutateGoal(input),
      },
      { headers },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
