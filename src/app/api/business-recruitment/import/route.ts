import { NextResponse } from "next/server";

import { isAppError } from "@/lib/errors";
import {
  getRecruitmentImportTemplate,
  importRecruitmentWorkbook,
} from "@/modules/business-recruitment/server";

const ALLOWED_PLATFORMS = new Set(["douyin", "kuaishou", "other"]);
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export async function GET() {
  try {
    const template = await getRecruitmentImportTemplate();
    return new Response(new Uint8Array(template), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          "attachment; filename*=UTF-8''%E5%95%86%E5%8A%A1%E6%8B%9B%E5%8B%9F%E6%89%B9%E9%87%8F%E5%AF%BC%E5%85%A5%E6%A8%A1%E6%9D%BF.xlsx",
      },
    });
  } catch (error) {
    if (isAppError(error)) return NextResponse.json(error.toJSON(), { status: error.httpStatus });
    console.error("[business-recruitment-template]", error);
    return NextResponse.json({ error: { message: "模板生成失败" } }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const defaultPlatform = String(formData.get("defaultPlatform") ?? "");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: { message: "请选择 Excel 文件" } }, { status: 400 });
    }
    if (!ALLOWED_PLATFORMS.has(defaultPlatform)) {
      return NextResponse.json({ error: { message: "请选择默认平台" } }, { status: 400 });
    }
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      return NextResponse.json(
        { error: { message: "仅支持 .xlsx、.xls 或 .csv 文件" } },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: { message: "文件超过 5MB，请拆分后导入" } },
        { status: 400 },
      );
    }
    const result = await importRecruitmentWorkbook(
      Buffer.from(await file.arrayBuffer()),
      defaultPlatform as "douyin" | "kuaishou" | "other",
    );
    return NextResponse.json(result);
  } catch (error) {
    if (isAppError(error)) return NextResponse.json(error.toJSON(), { status: error.httpStatus });
    console.error("[business-recruitment-import]", error);
    return NextResponse.json({ error: { message: "批量导入失败" } }, { status: 500 });
  }
}
