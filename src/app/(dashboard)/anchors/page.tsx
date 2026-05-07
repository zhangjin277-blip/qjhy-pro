import { AnchorTable } from "./_components/anchor-table";

export default function AnchorsPage(): React.JSX.Element {
  return (
    <div className="min-w-0 max-w-full space-y-3 px-1 py-1 md:px-1.5 md:py-1.5">
      <div className="flex items-center gap-1 border-b border-slate-200 pb-1">
        <span className="mr-2 px-3 py-1.5 text-sm font-semibold text-slate-700">主播明细</span>
      </div>
      <AnchorTable />
    </div>
  );
}
