import { NextRequest, NextResponse } from "next/server";
import { getCurrentDingtalkUser, requireUser } from "@/lib/auth/page-auth";
import { AppError } from "@/lib/errors";
import {
  projectSharedStateParamsSchema,
  projectSharedStatePutSchema,
} from "@/modules/project-shared-state";
import {
  createProjectSharedState,
  getProjectSharedState,
  updateProjectSharedState,
} from "@/modules/project-shared-state/server";
import { hasPoint } from "@/modules/permissions";
import { resolvePermission } from "@/modules/permissions/server";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

function jsonRow(row: NonNullable<Awaited<ReturnType<typeof getProjectSharedState>>>) {
  return {
    payload: row.payload,
    revision: row.revision,
    updatedAt: row.updated_at.toISOString(),
    updatedBy: row.updated_by,
  };
}

function authError(error: unknown): NextResponse | null {
  return error instanceof AppError
    ? NextResponse.json({ error: error.message }, { status: error.httpStatus })
    : null;
}

interface RouteContext {
  params: Promise<{ projectKey: string; stateKey: string }>;
}

async function canAccessProject(projectKey: string): Promise<boolean> {
  // Workbench notices and private read receipts use dedicated authorization.
  if (projectKey === "workbench") return false;
  if (projectKey !== "buyu") return true;
  const identity = await getCurrentDingtalkUser();
  if (identity.kind !== "ok") return false;
  if (identity.isEmergency) return true;
  const permission = await resolvePermission(identity.dingtalkUserId, "project_buyu");
  return permission.scope !== "none";
}

export async function GET(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    await requireUser();
  } catch (error) {
    const response = authError(error);
    if (response) return response;
    throw error;
  }
  const parsed = projectSharedStateParamsSchema.safeParse(await context.params);
  if (!parsed.success) return NextResponse.json({ error: "无效的项目状态标识" }, { status: 400 });
  if (!(await canAccessProject(parsed.data.projectKey))) {
    return NextResponse.json({ error: "暂无此共享状态的访问权限" }, { status: 403 });
  }
  const row = await getProjectSharedState(parsed.data.projectKey, parsed.data.stateKey);
  if (!row) return NextResponse.json({ error: "共享状态尚未创建" }, { status: 404 });
  return NextResponse.json(jsonRow(row));
}

export async function PUT(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (error) {
    const response = authError(error);
    if (response) return response;
    throw error;
  }
  const params = projectSharedStateParamsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "无效的项目状态标识" }, { status: 400 });
  if (!(await canAccessProject(params.data.projectKey))) {
    return NextResponse.json({ error: "暂无此共享状态的访问权限" }, { status: 403 });
  }
  // 项目共享状态的写入统一受项目编辑权限保护；读取仍由项目访问范围控制。
  // 其他项目暂不改变原有行为，便于后续按项目逐一注册权限点。
  if (params.data.projectKey === "zhaohua") {
    const identity = await getCurrentDingtalkUser();
    const projectPermission =
      identity.kind === "ok"
        ? await resolvePermission(identity.dingtalkUserId, "project_zhaohua")
        : null;
    const editable =
      identity.kind === "ok" &&
      (identity.isEmergency ||
        (projectPermission !== null && hasPoint(projectPermission, "project_edit")) ||
        // 项目范围为“全部”的项目负责人可维护共享项目数据；
        // self/team 范围仍必须显式授予项目数据编辑点。
        projectPermission?.scope === "all");
    if (!editable) {
      return NextResponse.json({ error: "暂无造化仙府项目编辑权限" }, { status: 403 });
    }
  }
  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "共享状态不能超过 2MB" }, { status: 413 });
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "请求内容不是有效 JSON" }, { status: 400 });
  }
  if (JSON.stringify(raw).length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "共享状态不能超过 2MB" }, { status: 413 });
  }
  const body = projectSharedStatePutSchema.safeParse(raw);
  if (!body.success) return NextResponse.json({ error: "共享状态内容无效" }, { status: 400 });

  const { projectKey, stateKey } = params.data;
  const row =
    body.data.revision === null
      ? await createProjectSharedState(projectKey, stateKey, body.data.payload, userId)
      : await updateProjectSharedState(
          projectKey,
          stateKey,
          body.data.payload,
          body.data.revision,
          userId,
        );
  if (row) return NextResponse.json(jsonRow(row));

  const current = await getProjectSharedState(projectKey, stateKey);
  return NextResponse.json(
    { error: "数据已被其他同事更新", current: current ? jsonRow(current) : null },
    { status: 409 },
  );
}
