"use server";
import { db } from "@/db/client";
import { live_room } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/admin-guard";
import { AppError } from "@/lib/errors";
import { eq } from "drizzle-orm";
import { CreateRoomInput, UpdateRoomInput, DeleteRoomInput } from "./schema";

export async function createRoom(input: unknown) {
  const data = CreateRoomInput.parse(input);
  const { userId } = await requireAdmin();

  const id = crypto.randomUUID();
  const [created] = await db
    .insert(live_room)
    .values({ id, ...data })
    .returning();

  await writeAuditLog({
    user_id: userId,
    action: "LIVE_ROOM_CREATED",
    target_type: "live_room",
    target_id: id,
    after: created,
  });

  return created;
}

export async function updateRoom(input: unknown) {
  const data = UpdateRoomInput.parse(input);
  const { userId } = await requireAdmin();

  const [before] = await db.select().from(live_room).where(eq(live_room.id, data.id));
  if (!before) throw new AppError("LIVE_ROOM_NOT_FOUND", "直播间不存在", 404);

  const [updated] = await db
    .update(live_room)
    .set({
      room_no: data.room_no,
      location: data.location,
      status: data.status,
      updated_at: new Date(),
    })
    .where(eq(live_room.id, data.id))
    .returning();

  await writeAuditLog({
    user_id: userId,
    action: "LIVE_ROOM_UPDATED",
    target_type: "live_room",
    target_id: data.id,
    before,
    after: updated,
  });

  return updated;
}

export async function deleteRoom(input: unknown) {
  const { id } = DeleteRoomInput.parse(input);
  const { userId } = await requireAdmin();

  const [before] = await db.select().from(live_room).where(eq(live_room.id, id));
  if (!before) throw new AppError("LIVE_ROOM_NOT_FOUND", "直播间不存在", 404);

  await db.delete(live_room).where(eq(live_room.id, id));

  await writeAuditLog({
    user_id: userId,
    action: "LIVE_ROOM_DELETED",
    target_type: "live_room",
    target_id: id,
    before,
  });

  return { ok: true } as const;
}
