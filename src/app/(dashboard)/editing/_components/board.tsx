"use client";
import { useState } from "react";
import type { BoardCard, EditingTaskStatus } from "@/modules/editing-task";
import type { EditorOption } from "@/modules/editing-editor";
import type { ProductOption } from "@/modules/product-config";
import { Column } from "./board-column";
import { SelectionProvider, useSelection } from "./selection-store";
import { FloatingActionBar } from "./floating-action-bar";
import { FilterBar } from "./filter-bar";
import { TaskDrawer } from "./task-drawer";
import { NewTaskDialog } from "./new-task-dialog";

const COLUMNS: { status: EditingTaskStatus; label: string; dotColorClass: string }[] = [
  { status: "uploaded", label: "待剪辑", dotColorClass: "bg-blue-500" },
  { status: "editing", label: "剪辑中", dotColorClass: "bg-amber-500" },
  { status: "review", label: "审核", dotColorClass: "bg-purple-500" },
  { status: "ready", label: "待发布", dotColorClass: "bg-cyan-500" },
  { status: "published", label: "已发布", dotColorClass: "bg-green-500" },
];

interface Props {
  initialCards: BoardCard[];
  editors: EditorOption[];
  products: ProductOption[];
  permissions: { canEdit: boolean; isAdmin: boolean };
}

export function Board({ initialCards, editors, products, permissions }: Props) {
  const [openTaskId, setOpenTaskId] = useState<number | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  return (
    <SelectionProvider>
      <FilterBar products={products} editors={editors} onNewTask={() => setNewOpen(true)} />
      <Workspace cards={initialCards} onOpenDrawer={setOpenTaskId} />
      <FloatingActionBar editors={editors} />
      {openTaskId !== null && (
        <TaskDrawer
          taskId={openTaskId}
          onClose={() => setOpenTaskId(null)}
          editors={editors}
          permissions={permissions}
        />
      )}
      {newOpen && <NewTaskDialog onClose={() => setNewOpen(false)} products={products} />}
    </SelectionProvider>
  );
}

function Workspace({
  cards,
  onOpenDrawer,
}: {
  cards: BoardCard[];
  onOpenDrawer: (id: number) => void;
}) {
  const { toggle, selectedIds } = useSelection();

  const byStatus = new Map<EditingTaskStatus, BoardCard[]>();
  for (const col of COLUMNS) byStatus.set(col.status, []);
  for (const c of cards) byStatus.get(c.status)?.push(c);

  return (
    <div className="rounded-3xl border-2 border-white/98 bg-[var(--bg-workspace)] p-4 backdrop-blur-lg shadow-[0_0_0_1px_rgba(210,220,245,0.42),0_24px_68px_-40px_rgba(40,55,120,0.42)]">
      <div className="grid grid-cols-5 gap-3.5">
        {COLUMNS.map((col) => (
          <Column
            key={col.status}
            status={col.status}
            label={col.label}
            dotColorClass={col.dotColorClass}
            cards={byStatus.get(col.status) ?? []}
            selectedIds={selectedIds}
            onSelect={toggle}
            onOpenDrawer={onOpenDrawer}
          />
        ))}
      </div>
    </div>
  );
}
