import "server-only";

import { and, eq, like, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { project_shared_state } from "@/db/schema";

export async function getProjectSharedState(projectKey: string, stateKey: string) {
  const [row] = await db
    .select()
    .from(project_shared_state)
    .where(
      and(
        eq(project_shared_state.project_key, projectKey),
        eq(project_shared_state.state_key, stateKey),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listProjectSharedStatesByPrefix(projectKey: string, stateKeyPrefix: string) {
  return db
    .select()
    .from(project_shared_state)
    .where(
      and(
        eq(project_shared_state.project_key, projectKey),
        like(project_shared_state.state_key, `${stateKeyPrefix}%`),
      ),
    );
}

export async function createProjectSharedState(
  projectKey: string,
  stateKey: string,
  payload: unknown,
  userId: string,
) {
  const [row] = await db
    .insert(project_shared_state)
    .values({ project_key: projectKey, state_key: stateKey, payload, updated_by: userId })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

export async function updateProjectSharedState(
  projectKey: string,
  stateKey: string,
  payload: unknown,
  expectedRevision: number,
  userId: string,
) {
  const [row] = await db
    .update(project_shared_state)
    .set({
      payload,
      revision: sql`${project_shared_state.revision} + 1`,
      updated_by: userId,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(project_shared_state.project_key, projectKey),
        eq(project_shared_state.state_key, stateKey),
        eq(project_shared_state.revision, expectedRevision),
      ),
    )
    .returning();
  return row ?? null;
}
