"use client";
import { useState } from "react";
import { toast } from "sonner";
import type {
  BoardCard,
  EditingTaskStatus,
  FishCoverage,
  TodaySummary,
  TodayAnchorDist,
  TodayEditorLoad,
} from "@/modules/editing-task";
import { claimTask, resetEditing, reviewApprove } from "@/modules/editing-task";
import type { EditorOption } from "@/modules/editing-editor";
import type { ProductOption } from "@/modules/product-config";
import { Column } from "./board-column";
import { SelectionProvider, useSelection } from "./selection-store";
import { FloatingActionBar } from "./floating-action-bar";
import { FilterBar } from "./filter-bar";
import { ViewTabs } from "./view-tabs";
import { TaskDrawer } from "./task-drawer";
import { NewTaskDialog } from "./new-task-dialog";
import { TodayStatsPanel } from "./today-stats-panel";

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
  anchors: { id: string; name: string; businessLine: string }[];
  permissions: { canEdit: boolean; isAdmin: boolean };
  fishCoverage: FishCoverage;
  todaySummary: TodaySummary;
  anchorDist: TodayAnchorDist[];
  editorLoad: TodayEditorLoad[];
}

export function Board({
  initialCards,
  editors,
  products,
  anchors,
  permissions,
  fishCoverage,
  todaySummary,
  anchorDist,
  editorLoad,
}: Props) {
  const [openTaskId, setOpenTaskId] = useState<number | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  return (
    <SelectionProvider>
      <ViewTabs active="board" />
      <FilterBar
        products={products}
        editors={editors}
        anchors={anchors}
        onNewTask={() => setNewOpen(true)}
      />
      <TodayStatsPanel
        summary={todaySummary}
        anchorDist={anchorDist}
        editorLoad={editorLoad}
        fishCoverage={fishCoverage}
      />
      <Workspace cards={initialCards} editors={editors} onOpenDrawer={setOpenTaskId} />
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
  editors,
  onOpenDrawer,
}: {
  cards: BoardCard[];
  editors: EditorOption[];
  onOpenDrawer: (id: number) => void;
}) {
  const { toggle, selectedIds } = useSelection();

  const byStatus = new Map<EditingTaskStatus, BoardCard[]>();
  for (const col of COLUMNS) byStatus.set(col.status, []);
  for (const c of cards) byStatus.get(c.status)?.push(c);

  async function handleDrop(
    taskId: number,
    fromStatus: EditingTaskStatus,
    toStatus: EditingTaskStatus,
  ) {
    if (fromStatus === toStatus) return;

    // Only allow safe transitions that require no extra input
    const allowed =
      (fromStatus === "uploaded" && toStatus === "editing") ||
      (fromStatus === "editing" && toStatus === "uploaded") ||
      (fromStatus === "review" && toStatus === "ready");

    if (!allowed) {
      toast.error("此转换需要额外操作，请点开卡片在抽屉里完成");
      return;
    }

    try {
      if (fromStatus === "uploaded" && toStatus === "editing") {
        await claimTask({ taskId });
        toast.success("已领取");
      } else if (fromStatus === "editing" && toStatus === "uploaded") {
        if (!confirm("回退到待剪辑？将清空剪辑师")) return;
        await resetEditing({ taskId });
        toast.success("已回退");
      } else if (fromStatus === "review" && toStatus === "ready") {
        if (!confirm("审核通过？")) return;
        await reviewApprove({ taskId });
        toast.success("审核通过");
      }
      location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    }
  }

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
            editors={editors}
            onDropToColumn={handleDrop}
          />
        ))}
      </div>
    </div>
  );
}
