import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { INITIAL_GOALS } from "../src/modules/goals/initial-goals";

// Scoped local activation. Do not advance the Drizzle journal past earlier pending migrations.
if (!process.argv.includes("--apply"))
  throw new Error("Use --apply after taking a local database backup.");
const url = process.env.DATABASE_URL;
if (!url || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname))
  throw new Error("This initializer is restricted to the local database.");
const client = postgres(url, { max: 1, prepare: false });
function stableId(key: string) {
  const h = createHash("sha256")
    .update("qjhy-goals-2026-10:" + key)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
async function main() {
  try {
    await client.begin(async (tx) => {
      await tx.unsafe(await readFile("src/db/migrations/0082_business_goals.sql", "utf8"));
      let added = 0,
        unresolved = 0;
      for (const seed of INITIAL_GOALS) {
        const { key, names, parentKey, ...definition } = seed;
        const existing = await tx`select id from business_goal where id=${stableId(key)}`;
        if (existing.length) continue; // Never overwrite user edits on rerun.
        const ids: string[] = [],
          labels: string[] = [];
        for (const name of names) {
          const rows =
            await tx`select user_id from dingtalk_user where name=${name} and active=true and is_external=false`;
          if (rows.length === 1 && rows[0]) ids.push(rows[0].user_id);
          else {
            labels.push(name);
            unresolved++;
          }
        }
        const goal = {
          ...definition,
          id: stableId(key),
          owner_ids: ids,
          owner_labels: labels,
          parent_id: parentKey ? stableId(parentKey) : null,
          actual: null,
          as_of: null,
          evidence: "",
          status: "draft",
          version: 1,
          created_by: "system:goal-bootstrap",
        };
        await tx`insert into business_goal ${tx(goal, "id", "period", "project", "line", "dept_id", "metric", "unit", "kind", "target", "definition", "confirmed", "parent_id", "actual", "as_of", "evidence", "status", "version", "created_by")}`;
        await tx`update business_goal set owner_ids=${tx.json(ids)},owner_labels=${tx.json(labels)} where id=${goal.id}`;
        await tx`insert into business_goal_revision(id,goal_id,action,before,after,reason,actor_id,actor_name) values(${randomUUID()},${goal.id},'create',null,${tx.json(JSON.parse(JSON.stringify(goal)))},'按已确认方案初始化截图目标草稿；实际值未填报','system:goal-bootstrap','初始化')`;
        added++;
      }
      console.log(
        JSON.stringify({
          addedDrafts: added,
          unresolvedOwnerNames: unresolved,
          actualsImported: 0,
        }),
      );
    });
  } finally {
    await client.end();
  }
}
main().catch(() => {
  console.error("Local goal initialization failed; transaction rolled back.");
  process.exitCode = 1;
});
