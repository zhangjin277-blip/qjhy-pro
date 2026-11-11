import { AppError } from "@/lib/errors";
import { listGoals } from "@/modules/goals/server";
import { GoalsClient } from "./goals-client";
export const dynamic = "force-dynamic";
export default async function GoalsPage() {
  try {
    return <GoalsClient initial={await listGoals(undefined, false, { resolveSources: false })} />;
  } catch (error) {
    return (
      <main className="p-8">
        <h1 className="text-xl font-semibold">目标管理</h1>
        <p className="mt-4 text-slate-600">
          {error instanceof AppError ? error.message : "目标管理暂时无法加载，请稍后重试"}
        </p>
      </main>
    );
  }
}
