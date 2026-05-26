"use client";
import { createContext, useContext, useState, type ReactNode } from "react";

interface SelectionCtx {
  selectedIds: Set<number>;
  toggle: (id: number) => void;
  clear: () => void;
}

const Ctx = createContext<SelectionCtx | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  return (
    <Ctx.Provider
      value={{
        selectedIds,
        toggle: (id) =>
          setSelectedIds((s) => {
            const n = new Set(s);
            if (n.has(id)) n.delete(id);
            else n.add(id);
            return n;
          }),
        clear: () => setSelectedIds(new Set()),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSelection() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSelection outside provider");
  return c;
}
