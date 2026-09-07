import { describe, expect, it } from "vitest";
import {
  projectSharedStateParamsSchema,
  projectSharedStatePutSchema,
} from "@/modules/project-shared-state";

describe("project shared state validation", () => {
  it("accepts reusable project and state keys", () => {
    expect(
      projectSharedStateParamsSchema.parse({
        projectKey: "zhaohua",
        stateKey: "execution_tasks",
      }),
    ).toEqual({ projectKey: "zhaohua", stateKey: "execution_tasks" });
  });

  it("rejects path-like keys", () => {
    expect(
      projectSharedStateParamsSchema.safeParse({
        projectKey: "../zhaohua",
        stateKey: "execution/tasks",
      }).success,
    ).toBe(false);
  });

  it("requires null for bootstrap and a positive revision for updates", () => {
    expect(projectSharedStatePutSchema.safeParse({ payload: [], revision: null }).success).toBe(
      true,
    );
    expect(projectSharedStatePutSchema.safeParse({ payload: [], revision: 3 }).success).toBe(true);
    expect(projectSharedStatePutSchema.safeParse({ payload: [], revision: 0 }).success).toBe(false);
  });
});
