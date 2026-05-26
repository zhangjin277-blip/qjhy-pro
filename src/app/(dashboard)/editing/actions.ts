"use server";
import { getTask, listEvents } from "@/modules/editing-task/server";

export async function loadTaskDetail(taskId: number) {
  const [task, events] = await Promise.all([getTask(taskId), listEvents(taskId)]);
  return { task, events };
}
