import { NextResponse } from "next/server";

import { isAppError } from "@/lib/errors";
import { deletePerformanceCycle } from "@/modules/people-performance";

export async function DELETE(request: Request) {
  try {
    return NextResponse.json(await deletePerformanceCycle(await request.json()));
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json(error.toJSON(), { status: error.httpStatus });
    }
    console.error("[people-performance-cycle-delete]", error);
    return NextResponse.json(
      { error: { message: "删除考核周期失败，请稍后重试" } },
      { status: 500 },
    );
  }
}
