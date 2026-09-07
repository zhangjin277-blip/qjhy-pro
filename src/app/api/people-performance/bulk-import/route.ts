import { NextResponse } from "next/server";

import { isAppError } from "@/lib/errors";
import {
  createPeoplePerformanceTemplate,
  importPeoplePerformanceWorkbook,
} from "@/modules/people-performance";

export async function GET() {
  try {
    const content = await createPeoplePerformanceTemplate();
    return new Response(new Uint8Array(content), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename*=UTF-8''people-performance-template.xlsx",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (isAppError(error)) return NextResponse.json(error.toJSON(), { status: error.httpStatus });
    console.error("[people-performance-template]", error);
    return NextResponse.json({ error: { message: "模板生成失败" } }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: { message: "请选择Excel文件" } }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: { message: "文件不能超过5MB" } }, { status: 400 });
    }
    const result = await importPeoplePerformanceWorkbook(Buffer.from(await file.arrayBuffer()));
    return NextResponse.json(result);
  } catch (error) {
    if (isAppError(error)) return NextResponse.json(error.toJSON(), { status: error.httpStatus });
    console.error("[people-performance-bulk-import]", error);
    return NextResponse.json(
      { error: { message: "批量导入失败，请检查模板内容" } },
      { status: 500 },
    );
  }
}
