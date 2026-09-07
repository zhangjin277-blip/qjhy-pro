import { NextResponse } from "next/server";

import { isAppError } from "@/lib/errors";
import { reviewPerformanceGoals } from "@/modules/people-performance";

export async function POST(request: Request) {
  try {
    const result = await reviewPerformanceGoals(await request.json());
    return NextResponse.json(result);
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json(error.toJSON(), { status: error.httpStatus });
    }
    console.error("[people-performance-goal-review]", error);
    return NextResponse.json({ error: { message: "目标审核失败，请稍后重试" } }, { status: 500 });
  }
}
