import { NextResponse } from "next/server";
import { z } from "zod";
import { isAppError } from "@/lib/errors";
import {
  openProbationGoalSetting,
  submitPerformanceSelfReview,
  submitPerformanceManagerReview,
  submitPerformanceSkipManagerReview,
  calibratePerformance,
  savePeopleProfile,
} from "@/modules/people-performance";

const handlers = {
  save_profile: savePeopleProfile,
  open_goals: openProbationGoalSetting,
  self_review: submitPerformanceSelfReview,
  manager_review: submitPerformanceManagerReview,
  skip_manager_review: submitPerformanceSkipManagerReview,
  calibrate: calibratePerformance,
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const operation = z
      .enum(
        [
          "save_profile",
          "open_goals",
          "self_review",
          "manager_review",
          "skip_manager_review",
          "calibrate",
        ],
        { error: "操作类型无效，请刷新后重试" },
      )
      .parse(body?.operation);
    return NextResponse.json(await handlers[operation](body.input));
  } catch (error) {
    if (isAppError(error)) return NextResponse.json(error.toJSON(), { status: error.httpStatus });
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      const fields: Record<string, string> = {
        summary: "整体评语",
        comment: "校准意见",
        rating: "评级",
        goals: "考核目标",
        score: "评分",
        completion: "目标完成情况",
        cycleId: "考核周期",
        operation: "操作类型",
      };
      const field = String(issue?.path.at(-1) ?? "");
      const message =
        issue && /[\u4e00-\u9fff]/u.test(issue.message)
          ? issue.message
          : `请检查${fields[field] ?? "填写内容"}，填写完整后再提交`;
      return NextResponse.json({ error: { message } }, { status: 400 });
    }
    if (error instanceof SyntaxError)
      return NextResponse.json(
        { error: { message: "提交内容格式有误，请刷新后重试" } },
        { status: 400 },
      );
    console.error("[people-performance-assessment]", error);
    return NextResponse.json(
      { error: { message: "提交失败，请稍后重试；如持续失败，请联系管理员查看日志" } },
      { status: 500 },
    );
  }
}
