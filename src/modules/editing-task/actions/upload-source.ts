"use server";
import { db } from "@/db/client";
import { editing_task, live_account, live_room, dingtalk_user, live_anchor } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { writeEvent } from "../event-writer";
import { requireEditingPoint } from "../authz";
import { buildEditingScopeWhere } from "../scope";
import {
  buildSourcePath,
  buildFishSourcePath,
  buildPokerSlgSourcePath,
  isFishProduct,
  isPokerSlgProduct,
  moveTempWithSeq as nasMoveTempWithSeq,
  removeFile as nasRemoveFile,
  removeTemp as nasRemoveTemp,
} from "@/modules/editing-storage/server";
import { UploadSourceInput } from "../schema";

/**
 * 文件已由 route 层（parseUploadToTemp）流式落盘到 NAS 临时文件并算好 md5。
 * 本函数只负责：判重 → 计算正式路径 → 排他落盘（O_EXCL 占位，防并发序号撞车）。
 * 不再把文件读进内存（原 `Buffer.from(await file.arrayBuffer())` 会 OOM）。
 */
export interface UploadSourceParams {
  taskId: number;
  fileName: string;
  md5: string;
  tmpRelPath: string;
  durationSec?: number | null;
}

export async function uploadSource(params: UploadSourceParams): Promise<{ ok: true }> {
  const data = UploadSourceInput.parse(params);
  // 素材时长（秒）由前端读取后随上传传入；累加到 source_duration_sec（多素材=总时长）
  const durationSec = data.durationSec ?? null;
  const { userId, perm } = await requireEditingPoint("source_upload");
  const scopeWhere = await buildEditingScopeWhere({ scope: perm.scope, userId });

  const [task] = await db
    .select({
      id: editing_task.id,
      material_date: editing_task.material_date,
      live_account_id: editing_task.live_account_id,
      anchor_id: editing_task.anchor_id,
      status: editing_task.status,
      product: live_account.product,
      source_duration_sec: editing_task.source_duration_sec,
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

  // scope 外 / 已软删一律按不存在处理（软删任务的文件 30 天后会被物理清理，不能再往里挂文件）
  if (!task) throw new Error("task not found");
  if (task.status !== "uploaded") throw new Error("仅 uploaded 状态可上传素材");

  const NAS = process.env.EDITING_NAS_PATH;
  if (!NAS) throw new Error("EDITING_NAS_PATH not configured");

  const md5 = data.md5;

  // MD5 判重：只看未软删的任务 —— 软删任务的文件会被 30 天清理 job 物理删除，
  // 复用其路径会让新任务的素材跟着一起消失
  const dupRows = await db
    .select({
      id: editing_task.id,
      source_files: editing_task.source_files,
      source_file_hashes: editing_task.source_file_hashes,
    })
    .from(editing_task)
    .where(
      and(
        sql`${editing_task.source_file_hashes} @> ${JSON.stringify([md5])}::jsonb`,
        isNull(editing_task.deleted_at),
      ),
    );

  const materialDateStr = task.material_date.toISOString().slice(0, 10);
  let relPath: string;
  let movedToFinal = false; // 秒传复用共享文件时为 false，补偿清理不能删别人的文件
  let duplicateOf: number | null = null;

  if (dupRows.length > 0 && dupRows[0] !== undefined) {
    // Found existing file with same MD5 — reuse path (no write needed)
    const oldTask = dupRows[0];
    const idx = (oldTask.source_file_hashes ?? []).indexOf(md5);
    relPath =
      (oldTask.source_files ?? [])[idx] ??
      buildSourcePath({
        taskId: task.id,
        product: task.product ?? "未分类",
        materialDate: materialDateStr,
        originalName: data.fileName,
      });
    if (oldTask.id !== task.id) duplicateOf = oldTask.id;
    // 复用已有文件，临时文件不再需要
    await nasRemoveTemp(NAS, data.tmpRelPath);
  } else if (isFishProduct(task.product) && task.anchor_name && task.anchor_id) {
    // 捕鱼系特殊命名：YYYYMMDD-直播间-主播-NN
    // 计算同日期 + 直播间（room_id） + 主播下已有素材总数
    const anchorId = task.anchor_id;
    const roomId = sql`(SELECT room_id FROM live_account WHERE id = ${task.live_account_id})`;
    const countRows = await db
      .select({
        existingCount: sql<number>`COALESCE(SUM(jsonb_array_length(${editing_task.source_files})), 0)::int`,
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
        buildFishSourcePath({
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
    movedToFinal = true;
  } else if (isPokerSlgProduct(task.product)) {
    // 斗地主 / 三国冰河时代：YYYYMMDD-{产品}-{直播间}-NN.ext（无主播段）
    // room_id 用 IS NOT DISTINCT FROM：NULL 也能正确同组递增（否则 NULL=NULL 永不匹配 → 序号恒 1 → 撞车覆盖）
    const roomId = sql`(SELECT room_id FROM live_account WHERE id = ${task.live_account_id})`;
    const countRows = await db
      .select({
        existingCount: sql<number>`COALESCE(SUM(jsonb_array_length(${editing_task.source_files})), 0)::int`,
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
        buildPokerSlgSourcePath({
          taskId: task.id,
          product: task.product ?? "未分类",
          materialDate: materialDateStr,
          originalName: data.fileName,
          roomName: task.room_name,
          sequenceNumber: seq,
        }),
      (countRows[0]?.existingCount ?? 0) + 1,
    );
    movedToFinal = true;
  } else {
    // 普通路径：task-{id}-{文件名}。同名冲突（同任务重传不同内容的同名文件 / 并发）
    // 时在文件名前加 N- 前缀重试，避免 rename 静默覆盖
    relPath = await nasMoveTempWithSeq(
      NAS,
      data.tmpRelPath,
      (n) =>
        buildSourcePath({
          taskId: task.id,
          product: task.product ?? "未分类",
          materialDate: materialDateStr,
          originalName: n === 1 ? data.fileName : `${n}-${data.fileName}`,
        }),
      1,
    );
    movedToFinal = true;
  }

  // 规则化命名（捕鱼系 / 斗地主 / 三冰）：UI / 下载文件名用规则化的 basename
  // 普通任务：保留原文件名
  const isRegulated =
    (isFishProduct(task.product) && task.anchor_name && task.anchor_id) ||
    isPokerSlgProduct(task.product);
  const displayName = isRegulated ? (relPath.split("/").pop() ?? data.fileName) : data.fileName;

  try {
    // 主表更新 + 事件同事务；WHERE 带 status 守卫防并发期间任务被派单/删除。
    // jsonb 用 SQL 原子追加（||），避免读旧快照整体覆盖写回 —— 并发上传会互相丢文件记录
    await db.transaction(async (tx) => {
      const rows = await tx
        .update(editing_task)
        .set({
          source_files: sql`${editing_task.source_files} || ${JSON.stringify([relPath])}::jsonb`,
          source_file_names: sql`${editing_task.source_file_names} || ${JSON.stringify([displayName])}::jsonb`,
          source_file_hashes: sql`${editing_task.source_file_hashes} || ${JSON.stringify([md5])}::jsonb`,
          source_uploaded_at: new Date(),
          ...(durationSec != null
            ? {
                source_duration_sec: sql`COALESCE(${editing_task.source_duration_sec}, 0) + ${durationSec}`,
              }
            : {}),
          ...(duplicateOf != null ? { is_duplicate: true, duplicate_of: duplicateOf } : {}),
        })
        .where(and(eq(editing_task.id, task.id), eq(editing_task.status, "uploaded")))
        .returning({ id: editing_task.id });
      if (rows.length === 0) throw new Error("任务状态已变化，请刷新");

      if (duplicateOf != null) {
        await writeEvent(
          {
            taskId: task.id,
            eventType: "duplicate_detected",
            actorUserId: userId,
            payload: { duplicate_of: duplicateOf, md5 },
          },
          tx,
        );
      }
      await writeEvent(
        {
          taskId: task.id,
          eventType: "source_uploaded",
          actorUserId: userId,
          payload: { file_count: 1, file_names: [displayName] },
        },
        tx,
      );
    });
  } catch (err) {
    // DB 写失败补偿：临时文件已 move 走（route 的 removeTemp 删不到），
    // 删掉刚落盘的正式文件避免 NAS 孤儿。秒传复用的共享文件不能删。
    if (movedToFinal) await nasRemoveFile(NAS, relPath).catch(() => undefined);
    throw err;
  }

  return { ok: true };
}
