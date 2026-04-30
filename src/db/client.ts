import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://qjhy:qjhy_dev_password@localhost:5432/qjhy";

const queryClient = postgres(connectionString, {
  max: 10,
  prepare: false,
});

export const db = drizzle(queryClient);
export type Db = typeof db;
