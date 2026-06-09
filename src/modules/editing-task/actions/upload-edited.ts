"use server";
import { db } from "@/db/client";
import { editing_task, live_account, live_room, dingtalk_user, live_anchor } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { requireUser } from "@/lib/auth/page-auth";
import { writeEvent } from "../event-writer";
import {
  buildEditedPath,
  buildFishEditedPath,
  buildPokerSlgEditedPath,
  isFishProduct,
  isPokerSlgProduct,
  fileExists as nasFileExists,
  moveTemp as nasMoveTemp,
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
 * 本函数计算正式路径后 moveTemp（rename）到位，不把文件读进内存（原方案会 OOM）。
 */
export interface UploadEditedParams {
  taskId: number;
  fileName: string;
  md5: string;
  tmpRelPath: string;
}

export async function uploadEdited(params: UploadEditedParams): Promise<{ ok: true }> {
  const data = Input.parse(params);
  const { userId } = await requireUser();

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
      edited_files: editing_task.edited_files,
      edited_file_names: editing_task.edited_file_names,
      edited_file_hashes: editing_task.edited_file_hashes,
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
    .where(eq(editing_task.id, data.taskId));

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
    let sequenceNumber = (countRows[0]?.existingCount ?? 0) + 1;
    const fishPath = (seq: number) =>
      buildFishEditedPath({
        taskId: task.id,
        product: task.product ?? "未分类",
        materialDate: materialDateStr,
        originalName: data.fileName,
        roomName: task.room_name,
        anchorName: task.anchor_name as string,
        sequenceNumber: seq,
      });
    relPath = fishPath(sequenceNumber);
    while (await nasFileExists(NAS, relPath)) relPath = fishPath(++sequenceNumber);
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
    let sequenceNumber = (countRows[0]?.existingCount ?? 0) + 1;
    const pokerPath = (seq: number) =>
      buildPokerSlgEditedPath({
        taskId: task.id,
        product: task.product ?? "未分类",
        materialDate: materialDateStr,
        originalName: data.fileName,
        roomName: task.room_name,
        sequenceNumber: seq,
      });
    relPath = pokerPath(sequenceNumber);
    while (await nasFileExists(NAS, relPath)) relPath = pokerPath(++sequenceNumber);
    displayName = relPath.split("/").pop() ?? data.fileName;
  } else {
    relPath = buildEditedPath({
      taskId: task.id,
      product: task.product ?? "未分类",
      materialDate: materialDateStr,
      originalName: data.fileName,
    });
  }
  await nasMoveTemp(NAS, data.tmpRelPath, relPath);

  // 始终追加，避免回退后再传覆盖原成品
  const isFirstTransition = task.status === "editing";
  if (isFirstTransition) assertTransition("editing", "review");

  await db
    .update(editing_task)
    .set({
      edited_files: [...(task.edited_files ?? []), relPath],
      edited_file_names: [...(task.edited_file_names ?? []), displayName],
      edited_file_hashes: [...(task.edited_file_hashes ?? []), md5],
      edited_uploaded_at: new Date(),
      ...(isFirstTransition ? { status: "review" as const } : {}),
    })
    .where(eq(editing_task.id, task.id));

  // 紧急任务首次进入 review：fire-and-forget 钉钉通知
  if (isFirstTransition && task.priority === "urgent") {
    notifyUrgentEditedUploaded(task.id).catch((e: unknown) => void e);
  }

  await writeEvent({
    taskId: task.id,
    eventType: "edited_uploaded",
    actorUserId: userId,
    payload: { file_count: 1, file_names: [displayName] },
  });

  return { ok: true };
}
