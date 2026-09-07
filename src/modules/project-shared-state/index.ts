import { z } from "zod";

export const projectSharedStateParamsSchema = z.object({
  projectKey: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  stateKey: z.string().regex(/^[a-z0-9][a-z0-9_]{0,63}$/),
});

export const projectSharedStatePutSchema = z.object({
  payload: z.unknown(),
  revision: z.number().int().positive().nullable(),
});

export interface ProjectSharedStateResponse<T> {
  payload: T;
  revision: number;
  updatedAt: string;
  updatedBy: string;
}
