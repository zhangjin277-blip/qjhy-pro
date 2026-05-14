import { NextRequest, NextResponse } from "next/server";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { db } from "@/db/client";
import { kuaishou_member } from "@/db/schema";
import { eq } from "drizzle-orm";

const VALID_PRODUCTS = new Set([
  "捕鱼大作战",
  "途游休闲捕鱼",
  "电玩捕鱼",
  "三国冰河时代",
  "迷游斗地主",
  "富豪麻将",
]);

/**
 * PATCH /api/anchors-kuaishou/[memberId]
 * Body: { manual_product: string | null }
 * 设置或清除手动覆盖的项目分类。
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ memberId: string }> },
): Promise<NextResponse> {
  const currentUser = await getCurrentDingtalkUser();
  if (currentUser.kind === "unauth") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (currentUser.kind === "user_not_synced") {
    return NextResponse.json({ error: "AUTH_USER_NOT_SYNCED" }, { status: 403 });
  }

  const { memberId } = await ctx.params;
  const body = (await req.json()) as { manual_product?: string | null };

  // null = 清除覆盖（恢复用 inferred_product）
  if (body.manual_product != null && !VALID_PRODUCTS.has(body.manual_product)) {
    return NextResponse.json({ error: "Invalid product" }, { status: 400 });
  }

  await db
    .update(kuaishou_member)
    .set({ manual_product: body.manual_product ?? null, updated_at: new Date() })
    .where(eq(kuaishou_member.user_id, memberId));

  return NextResponse.json({ ok: true });
}
