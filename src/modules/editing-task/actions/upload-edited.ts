"use server";
import { db } from "@/db/client";
import { editing_task, live_account, live_room, dingtalk_user, live_anchor } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { writeEvent } from "../event-writer";
import { requireEditingPoint } from "../authz";
import { buildEditingScopeWhere } from "../scope";
import {
  buildEditedPath,
  buildFishEditedPath,
  buildPokerSlgEditedPath,
  isFishProduct,
  isPokerSlgProduct,
  moveTempWithSeq as nasMoveTempWithSeq,
  removeFile as nasRemoveFile,
} from "@/modules/editing-storage/server";
import { z } from "zod";
import { assertTransition } from "../state-machine";
import { notifyUrgentEditedUploaded } from "../notify";

const Input = z.object({
  taskId: z.number().int().positive(),
  fileName: z.string().min(1).max(255),
  md5: z.string().regex(/^[a-f0-9]{32}$/),
  tmpRelPath: z.string().min(1),
});

/**
 * 文件已由 route 层（parseUploadToTemp）流式落盘到 NAS 临时文件并算好 md5。
 * 本函数计算正式路径后排他落盘（O_EXCL 占位，防并发序号撞车），不把文件读进内存（原方案会 OOM）。
 */
export interface UploadEditedParams {
  taskId: number;
  fileName: string;
  md5: string;
  tmpRelPath: string;
}

export async function uploadEdited(params: UploadEditedParams): Promise<{ ok: true }> {
  const data = Input.parse(params);
  const { userId, perm } = await requireEditingPoint("edited_upload");
  const scopeWhere = await buildEditingScopeWhere({ scope: perm.scope, userId });

  const [task] = await db
    .select({
      id: editing_task.id,
      material_date: editing_task.material_date,
      live_account_id: editing_task.live_account_id,
      anchor_id: editing_task.anchor_id,
      status: editing_task.status,
      priority: editing_task.priority,
      editor_user_id: editing_task.editor_user_id,
      product: live_account.product,
      room_name: live_room.room_no,
      anchor_name: sql<
        string | null
      >`COALESCE(${live_anchor.external_name}, ${dingtalk_user.name})`,
    })
    .from(editing_task)
    .leftJoin(live_account, eq(live_account.id, editing_task.live_account_id))
    .leftJoin(live_room, eq(live_room.id, live_account.room_id))
    .leftJoin(dingtalk_user, eq(dingtalk_user.user_id, editing_task.anchor_id))
    .leftJoin(live_anchor, eq(live_anchor.dingtalk_user_id, editing_task.anchor_id))
    .where(and(eq(editing_task.id, data.taskId), isNull(editing_task.deleted_at), scopeWhere));

  // scope 外 / 已软删一律按不存在处理
  if (!task) throw new Error("task not found");
  if (task.status !== "editing" && task.status !== "review") {
    throw new Error("仅 editing/review 状态可上传成品");
  }

  const NAS = process.env.EDITING_NAS_PATH;
  if (!NAS) throw new Error("EDITING_NAS_PATH not configured");

  const md5 = data.md5;

  const materialDateStr = task.material_date.toISOString().slice(0, 10);
  let relPath: string;
  let displayName = data.fileName;

  if (isFishProduct(task.product) && task.anchor_name && task.anchor_id) {
    // 捕鱼系特殊命名：YYYYMMDD-直播间-主播-NN
    const anchorId = task.anchor_id;
    const roomId = sql`(SELECT room_id FROM live_account WHERE id = ${task.live_account_id})`;
    const countRows = await db
      .select({
        existingCount: sql<number>`COALESCE(SUM(jsonb_array_length(${editing_task.edited_files})), 0)::int`,
      })
      .from(editing_task)
      .innerJoin(live_account, eq(live_account.id, editing_task.live_account_id))
      .where(
        and(
          eq(editing_task.material_date, task.material_date),
          sql`${live_account.room_id} IS NOT DISTINCT FROM ${roomId}`,
          eq(editing_task.anchor_id, anchorId),
        ),
      );
    // 排他落盘：O_EXCL 占位防并发撞车（rename 会静默覆盖），EEXIST 时序号 ++ 重试
    relPath = await nasMoveTempWithSeq(
      NAS,
      data.tmpRelPath,
      (seq) =>
        buildFishEditedPath({
          taskId: task.id,
          product: task.product ?? "未分类",
          materialDate: materialDateStr,
          originalName: data.fileName,
          roomName: task.room_name,
          anchorName: task.anchor_name as string,
          sequenceNumber: seq,
        }),
      (countRows[0]?.existingCount ?? 0) + 1,
    );
    displayName = relPath.split("/").pop() ?? data.fileName;
  } else if (isPokerSlgProduct(task.product)) {
    // 斗地主 / 三国冰河时代：YYYYMMDD-{产品}-{直播间}-NN.ext
    const roomId = sql`(SELECT room_id FROM live_account WHERE id = ${task.live_account_id})`;
    const countRows = await db
      .select({
        existingCount: sql<number>`COALESCE(SUM(jsonb_array_length(${editing_task.edited_files})), 0)::int`,
      })
      .from(editing_task)
      .innerJoin(live_account, eq(live_account.id, editing_task.live_account_id))
      .where(
        and(
          eq(editing_task.material_date, task.material_date),
          sql`${live_account.room_id} IS NOT DISTINCT FROM ${roomId}`,
        ),
      );
    relPath = await nasMoveTempWithSeq(
      NAS,
      data.tmpRelPath,
      (seq) =>
        buildPokerSlgEditedPath({
          taskId: task.id,
          product: task.product ?? "未分类",
          materialDate: materialDateStr,
          originalName: data.fileName,
          roomName: task.room_name,
          sequenceNumber: seq,
        }),
      (countRows[0]?.existingCount ?? 0) + 1,
    );
    displayName = relPath.split("/").pop() ?? data.fileName;
  } else {
    // 普通路径：task-{id}-{文件名}。同名冲突时在文件名前加 N- 前缀重试，避免静默覆盖
    relPath = await nasMoveTempWithSeq(
      NAS,
      data.tmpRelPath,
      (n) =>
        buildEditedPath({
          taskId: task.id,
          product: task.product ?? "未分类",
          materialDate: materialDateStr,
          originalName: n === 1 ? data.fileName : `${n}-${data.fileName}`,
        }),
      1,
    );
  }

  // 始终追加，避免回退后再传覆盖原成品
  const isFirstTransition = task.status === "editing";
  if (isFirstTransition) assertTransition("editing", "review");

  try {
    // 主表更新 + 事件同事务；WHERE 带 status 守卫 —— 防止读到 editing 后任务被
    // resetEditing 改回 uploaded，仍盲写 status=review 物化出非法跳变。
    // jsonb 用 SQL 原子追加，避免并发上传互相丢文件记录
    await db.transaction(async (tx) => {
      const rows = await tx
        .update(editing_task)
        .set({
          edited_files: sql`${editing_task.edited_files} || ${JSON.stringify([relPath])}::jsonb`,
          edited_file_names: sql`${editing_task.edited_file_names} || ${JSON.stringify([displayName])}::jsonb`,
          edited_file_hashes: sql`${editing_task.edited_file_hashes} || ${JSON.stringify([md5])}::jsonb`,
          edited_uploaded_at: new Date(),
          ...(isFirstTransition ? { status: "review" as const } : {}),
        })
        .where(and(eq(editing_task.id, task.id), eq(editing_task.status, task.status)))
        .returning({ id: editing_task.id });
      if (rows.length === 0) throw new Error("任务状态已变化，请刷新");

      await writeEvent(
        {
          taskId: task.id,
          eventType: "edited_uploaded",
          actorUserId: userId,
          payload: { file_count: 1, file_names: [displayName] },
        },
        tx,
      );
    });
  } catch (err) {
    // DB 写失败补偿：成品都是新落盘文件（无秒传复用），删掉避免 NAS 孤儿 + 占用序号
    await nasRemoveFile(NAS, relPath).catch(() => undefined);
    throw err;
  }

  // 紧急任务首次进入 review：fire-and-forget 钉钉通知
  if (isFirstTransition && task.priority === "urgent") {
    notifyUrgentEditedUploaded(task.id).catch((e: unknown) => void e);
  }

  return { ok: true };
}
