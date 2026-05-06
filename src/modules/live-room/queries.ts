import "server-only";
import { db } from "@/db/client";
import { live_room } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function listRooms() {
  return db.select().from(live_room).orderBy(live_room.room_no);
}

export async function getRoomById(id: string) {
  const rows = await db.select().from(live_room).where(eq(live_room.id, id)).limit(1);
  return rows[0] ?? null;
}
