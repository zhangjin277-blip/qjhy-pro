import "server-only";
import { db, type Db } from "@/db/client";
import { editing_task_event, type EditingEventType } from "@/db/schema/editing";

/**
 * db 实例或 db.transaction 回调里的 tx。
 * 让事件能与主表更新写进同一事务 —— 否则主表更新成功、事件写入失败时，
 * 依赖事件计数的统计（如剪辑师被回退数）会与主表状态不一致。
 */
export type DbExecutor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function writeEvent(
  args: {
    taskId: number;
    eventType: EditingEventType;
    actorUserId: string;
    payload?: Record<string, unknown>;
  },
  executor: DbExecutor = db,
): Promise<void> {
  await executor.insert(editing_task_event).values({
    task_id: args.taskId,
    event_type: args.eventType,
    actor_user_id: args.actorUserId,
    payload: args.payload ?? {},
  });
}
