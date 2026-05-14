import { NextRequest, NextResponse } from "next/server";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { SavePresetSchema, type PresetPlatform } from "@/modules/column-presets";
import { listUserPresets, createUserPreset } from "@/modules/column-presets/server";

function parsePlatform(v: string | null): PresetPlatform {
  return v === "kuaishou" ? "kuaishou" : "douyin";
}

async function resolveUserId(): Promise<string | NextResponse> {
  const currentUser = await getCurrentDingtalkUser();
  if (currentUser.kind === "unauth") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (currentUser.kind === "user_not_synced") {
    return NextResponse.json({ error: "AUTH_USER_NOT_SYNCED" }, { status: 403 });
  }
  return currentUser.dingtalkUserId;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = await resolveUserId();
  if (typeof userId !== "string") return userId;
  const platform = parsePlatform(req.nextUrl.searchParams.get("platform"));
  const presets = await listUserPresets(userId, platform);
  return NextResponse.json({ presets });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = await resolveUserId();
  if (typeof userId !== "string") return userId;
  const body = await req.json().catch(() => null);
  const parsed = SavePresetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_PARAMS", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const preset = await createUserPreset(
      userId,
      parsed.data.platform,
      parsed.data.name,
      parsed.data.columns,
      parsed.data.project,
    );
    return NextResponse.json({ preset });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("uq_user_column_preset_user_platform_name")) {
      return NextResponse.json({ error: "NAME_EXISTS" }, { status: 409 });
    }
    return NextResponse.json({ error: "DB_ERROR", detail: msg }, { status: 500 });
  }
}
