"use server";

import { AppError } from "@/lib/errors";
import { deleteWorkbenchNotice, markWorkbenchNoticesRead, publishWorkbenchNotice } from "./notices";

export async function deleteNotice(id: unknown) {
  try {
    await deleteWorkbenchNotice(id);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof AppError ? error.message : "公告删除失败，请稍后重试",
    };
  }
}

export async function publishNotice(input: unknown) {
  try {
    await publishWorkbenchNotice(input);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof AppError ? error.message : "公告发布失败，请稍后重试",
    };
  }
}
export async function readNotices(ids: unknown) {
  try {
    await markWorkbenchNoticesRead(ids);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof AppError ? error.message : "已读状态保存失败，请重试",
    };
  }
}
