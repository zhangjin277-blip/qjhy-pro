import { getDatabase } from "../src/modules/attendance/pro3/server/runtime";
import { syncRoster } from "../src/modules/attendance/pro3/server/roster";

async function main() {
  const host = new URL(process.env.DATABASE_URL || "").hostname;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) throw new Error("此脚本只允许同步本地数据库");
  const db = getDatabase();
  try {
    console.log(await syncRoster(db, undefined, "local:initial-import"));
  } finally { await db.sql.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
