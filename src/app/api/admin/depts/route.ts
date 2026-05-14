import { db } from "@/db/client";
import { dingtalk_dept } from "@/db/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { isAppError } from "@/lib/errors";
import { getDeptAliasMap } from "@/modules/aliases/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json(
      { error: isAppError(err) ? err.code : "AUTH_FORBIDDEN" },
      { status: isAppError(err) ? err.httpStatus : 403 },
    );
  }

  const [depts, aliasMap] = await Promise.all([
    db
      .select({
        dept_id: dingtalk_dept.dept_id,
        name: dingtalk_dept.name,
        parent_id: dingtalk_dept.parent_id,
      })
      .from(dingtalk_dept),
    getDeptAliasMap(),
  ]);

  const enriched = depts.map((d) => {
    const a = aliasMap.get(d.dept_id);
    return {
      ...d,
      alias: a?.alias ?? null,
      note: a?.note ?? null,
    };
  });

  return NextResponse.json({ depts: enriched });
}
