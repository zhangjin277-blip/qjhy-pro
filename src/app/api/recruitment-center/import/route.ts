import { NextResponse } from "next/server";

import { isAppError } from "@/lib/errors";
import { importPipelineWorkbook } from "@/modules/business-recruitment/server";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: { message: "请选择 Excel 文件" } }, { status: 400 });
    }
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      return NextResponse.json(
        { error: { message: "仅支持 .xlsx 或 .xls 文件" } },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: { message: "文件超过 10MB" } }, { status: 400 });
    }
    return NextResponse.json(await importPipelineWorkbook(Buffer.from(await file.arrayBuffer())));
  } catch (error) {
    if (isAppError(error)) return NextResponse.json(error.toJSON(), { status: error.httpStatus });
    console.error("[recruitment-center-import]", error);
    return NextResponse.json({ error: { message: "招聘表导入失败" } }, { status: 500 });
  }
}
