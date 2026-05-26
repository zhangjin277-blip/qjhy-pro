"use client";
import type { BoardCard } from "@/modules/editing-task";
import type { EditorOption } from "@/modules/editing-editor";
import type { ProductOption } from "@/modules/product-config";
import { useState } from "react";
import { FilterBar } from "./filter-bar";
import { NewTaskDialog } from "./new-task-dialog";

interface Props {
  initialCards: BoardCard[];
  editors: EditorOption[];
  products: ProductOption[];
  permissions: { canEdit: boolean; isAdmin: boolean };
}

export function Board(props: Props) {
  const [newTaskOpen, setNewTaskOpen] = useState(false);

  return (
    <>
      <FilterBar
        products={props.products}
        editors={props.editors}
        onNewTask={() => setNewTaskOpen(true)}
      />
      <div className="text-sm text-slate-500">
        加载 {props.initialCards.length} 个任务（看板组件在 T21/T22 完善）
      </div>
      {newTaskOpen && (
        <NewTaskDialog onClose={() => setNewTaskOpen(false)} products={props.products} />
      )}
    </>
  );
}
