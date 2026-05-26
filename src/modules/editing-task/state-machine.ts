import type { EditingTaskStatus } from "@/db/schema";

export const ALLOWED_TRANSITIONS: Record<EditingTaskStatus, EditingTaskStatus[]> = {
  uploaded: ["editing"],
  editing: ["uploaded", "review"],
  review: ["editing", "ready"],
  ready: ["published"],
  published: [],
};

export function canTransition(from: EditingTaskStatus, to: EditingTaskStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: EditingTaskStatus, to: EditingTaskStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`illegal transition: ${from} -> ${to}`);
  }
}
