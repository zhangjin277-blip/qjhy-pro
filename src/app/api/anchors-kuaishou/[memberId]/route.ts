import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { AppError } from "@/lib/errors";
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
 * 设置或清除手动覆盖的项目分类（admin only：改的是全局分类规则）。
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ memberId: string }> },
): Promise<NextResponse> {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.code }, { status: err.httpStatus });
    }
    throw err;
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
