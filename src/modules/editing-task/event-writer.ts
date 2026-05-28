import "server-only";
import { db } from "@/db/client";
import { editing_task_event, type EditingEventType } from "@/db/schema/editing";

export async function writeEvent(args: {
  taskId: number;
  eventType: EditingEventType;
  actorUserId: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(editing_task_event).values({
    task_id: args.taskId,
    event_type: args.eventType,
    actor_user_id: args.actorUserId,
    payload: args.payload ?? {},
  });
}
