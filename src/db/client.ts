import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://qjhy:qjhy_dev_password@localhost:5432/qjhy";

// Dev mode hot reload 会反复执行顶层代码，导致 postgres client 累积、连接打爆。
// 用 globalThis 缓存单例，hot reload 时复用同一个 client。
const globalForPg = globalThis as unknown as {
  __qjhyPgClient?: ReturnType<typeof postgres>;
};

const queryClient =
  globalForPg.__qjhyPgClient ??
  postgres(connectionString, {
    max: 10,
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPg.__qjhyPgClient = queryClient;
}

export const db = drizzle(queryClient);
export type Db = typeof db;
