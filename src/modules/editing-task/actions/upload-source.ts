"use server";
import { createHash } from "node:crypto";
import { db } from "@/db/client";
import { editing_task, live_account, live_room, anchor_profile } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { requireUser } from "@/lib/auth/page-auth";
import { writeEvent } from "../event-writer";
import {
  buildSourcePath,
  buildFishSourcePath,
  isFishProduct,
  writeFile as nasWriteFile,
} from "@/modules/editing-storage/server";
import { UploadSourceInput } from "../schema";

export async function uploadSource(formData: FormData): Promise<{ ok: true }> {
  const taskId = Number(formData.get("taskId"));
  const file = formData.get("file") as File | null;
  if (!file) throw new Error("missing file");
  const data = UploadSourceInput.parse({ taskId, fileName: file.name });
  const { userId } = await requireUser();

  const [task] = await db
    .select({
      id: editing_task.id,
      material_date: editing_task.material_date,
      live_account_id: editing_task.live_account_id,
      anchor_id: editing_task.anchor_id,
      status: editing_task.status,
      product: live_account.product,
      source_files: editing_task.source_files,
      source_file_names: editing_task.source_file_names,
      source_file_hashes: editing_task.source_file_hashes,
      room_name: live_room.room_no,
      anchor_name: anchor_profile.nick_name,
    })
    .from(editing_task)
    .leftJoin(live_account, eq(live_account.id, editing_task.live_account_id))
    .leftJoin(live_room, eq(live_room.id, live_account.room_id))
    .leftJoin(anchor_profile, eq(anchor_profile.anchor_id, editing_task.anchor_id))
    .where(eq(editing_task.id, data.taskId));

  if (!task) throw new Error("task not found");
  if (task.status !== "uploaded") throw new Error("仅 uploaded 状态可上传素材");

  const NAS = process.env.EDITING_NAS_PATH;
  if (!NAS) throw new Error("EDITING_NAS_PATH not configured");

  const buf = Buffer.from(await file.arrayBuffer());
  const md5 = createHash("md5").update(buf).digest("hex");

  // Check if this MD5 already exists in any task's source_file_hashes
  const dupRows = await db
    .select({
      id: editing_task.id,
      source_files: editing_task.source_files,
      source_file_hashes: editing_task.source_file_hashes,
    })
    .from(editing_task)
    .where(sql`${editing_task.source_file_hashes} @> ${JSON.stringify([md5])}::jsonb`);

  const materialDateStr = task.material_date.toISOString().slice(0, 10);
  let relPath: string;

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

    // Mark current task as duplicate (if different task)
    if (oldTask.id !== task.id) {
      await db
        .update(editing_task)
        .set({
          is_duplicate: true,
          duplicate_of: oldTask.id,
        })
        .where(eq(editing_task.id, task.id));

      await writeEvent({
        taskId: task.id,
        eventType: "duplicate_detected",
        actorUserId: userId,
        payload: { duplicate_of: oldTask.id, md5 },
      });
    }
  } else if (isFishProduct(task.product) && task.room_name && task.anchor_name && task.anchor_id) {
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
          sql`${live_account.room_id} = ${roomId}`,
          eq(editing_task.anchor_id, anchorId),
        ),
      );

    const existingCount = countRows[0]?.existingCount ?? 0;
    const sequenceNumber = existingCount + 1;
    relPath = buildFishSourcePath({
      taskId: task.id,
      product: task.product ?? "未分类",
      materialDate: materialDateStr,
      originalName: data.fileName,
      roomName: task.room_name,
      anchorName: task.anchor_name,
      sequenceNumber,
    });
    await nasWriteFile(NAS, relPath, buf);
  } else {
    // 普通路径
    relPath = buildSourcePath({
      taskId: task.id,
      product: task.product ?? "未分类",
      materialDate: materialDateStr,
      originalName: data.fileName,
    });
    await nasWriteFile(NAS, relPath, buf);
  }

  await db
    .update(editing_task)
    .set({
      source_files: [...(task.source_files ?? []), relPath],
      source_file_names: [...(task.source_file_names ?? []), data.fileName],
      source_file_hashes: [...(task.source_file_hashes ?? []), md5],
      source_uploaded_at: new Date(),
    })
    .where(eq(editing_task.id, task.id));

  await writeEvent({
    taskId: task.id,
    eventType: "source_uploaded",
    actorUserId: userId,
    payload: { file_count: 1, file_names: [data.fileName] },
  });

  return { ok: true };
}
