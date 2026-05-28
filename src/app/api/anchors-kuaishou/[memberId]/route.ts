import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-guard";
import { AppError } from "@/lib/errors";
import { db } from "@/db/client";
import { kuaishou_member } from "@/db/schema";
import { eq } from "drizzle-orm";

const VALID_PRODUCTS = [
  "捕鱼大作战",
  "途游休闲捕鱼",
  "电玩捕鱼",
  "三国冰河时代",
  "迷游斗地主",
  "富豪麻将",
] as const;

const patchBodySchema = z.object({
  manual_product: z.enum(VALID_PRODUCTS).nullable(),
});

/**
 * PATCH /api/anchors-kuaishou/[memberId]
 * Body: { manual_product: enum | null }
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

  let parsed: z.infer<typeof patchBodySchema>;
  try {
    const json = await req.json();
    parsed = patchBodySchema.parse(json);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "INVALID_BODY", detail: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  await db
    .update(kuaishou_member)
    .set({ manual_product: parsed.manual_product, updated_at: new Date() })
    .where(eq(kuaishou_member.user_id, memberId));

  return NextResponse.json({ ok: true });
}
