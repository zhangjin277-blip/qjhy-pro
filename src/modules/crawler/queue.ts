import "server-only";
import PgBoss from "pg-boss";
import { JOB_NAMES, type JobName } from "./types";

let _boss: PgBoss | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (_boss) return _boss;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not set");
  _boss = new PgBoss({
    connectionString: databaseUrl,
    schema: "pgboss",
    retryLimit: 3,
    retryBackoff: true, // 指数退避: 1s / 5s / 30s
    expireInHours: 6, // 单 job 超 6 小时未完成 → 失败
  });
  _boss.on("error", (err) => console.error("[pg-boss] error", err));
  await _boss.start();
  return _boss;
}

export async function stopBoss(): Promise<void> {
  if (_boss) {
    await _boss.stop({ graceful: true, close: true });
    _boss = null;
  }
}

/** Enqueue helper：所有 enqueue 走这个，统一日志 */
export async function enqueue<T extends object>(
  jobName: JobName,
  payload: T,
  opts?: { startAfter?: Date | string | number; singletonKey?: string },
): Promise<string | null> {
  const boss = await getBoss();
  // pg-boss v10 SendOptions.startAfter accepts Date | string;
  // convert number (seconds offset) to a Date for compatibility
  const startAfter =
    typeof opts?.startAfter === "number"
      ? new Date(Date.now() + opts.startAfter * 1000)
      : opts?.startAfter;
  const id = await boss.send(jobName, payload, {
    retryLimit: 3,
    retryBackoff: true,
    expireInHours: 2,
    startAfter,
    singletonKey: opts?.singletonKey,
  });
  console.log(`[queue] enqueued ${jobName}`, { id, payload });
  return id;
}

export { JOB_NAMES };
export type { JobName };
