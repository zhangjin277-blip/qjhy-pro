import { FilterBar } from "./_components/filter-bar";
import { BoardTabs } from "./_components/board-tabs";

export default function PlacementsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4 p-4">
      <BoardTabs />
      <FilterBar />
      <div>{children}</div>
    </div>
  );
}
