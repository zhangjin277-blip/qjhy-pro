import { NextResponse } from "next/server";
import {
  deleteProcurement,
  listProcurementLogs,
  transitionProcurement,
  updateProcurement,
} from "@/modules/procurement";
import { isAppError } from "@/lib/errors";
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json({ logs: await listProcurementLogs(Number((await ctx.params).id)) });
  } catch (e) {
    return NextResponse.json(
      isAppError(e) ? e.toJSON() : { error: { message: "加载操作记录失败" } },
      { status: isAppError(e) ? e.httpStatus : 500 },
    );
  }
}
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const body = await req.json();
    return NextResponse.json(
      await transitionProcurement(Number((await ctx.params).id), body.action, body),
    );
  } catch (e) {
    return NextResponse.json(
      isAppError(e) ? e.toJSON() : { error: { message: "更新采购状态失败" } },
      { status: isAppError(e) ? e.httpStatus : 500 },
    );
  }
}
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(
      await updateProcurement(Number((await ctx.params).id), await req.json()),
    );
  } catch (e) {
    return NextResponse.json(
      isAppError(e) ? e.toJSON() : { error: { message: "编辑采购记录失败" } },
      { status: isAppError(e) ? e.httpStatus : 500 },
    );
  }
}
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(await deleteProcurement(Number((await ctx.params).id)));
  } catch (e) {
    return NextResponse.json(
      isAppError(e) ? e.toJSON() : { error: { message: "删除采购记录失败" } },
      { status: isAppError(e) ? e.httpStatus : 500 },
    );
  }
}
