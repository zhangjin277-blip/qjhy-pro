"use client";
import type { EditorOption } from "@/modules/editing-editor";

interface Props {
  taskId: number;
  onClose: () => void;
  editors: EditorOption[];
  permissions: { canEdit: boolean; isAdmin: boolean };
}

export function TaskDrawer(_: Props) {
  return null;
}
