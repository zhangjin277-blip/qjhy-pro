import { AnchorTable } from "./_components/anchor-table";

export default function AnchorsPage(): React.JSX.Element {
  return (
    <div className="min-w-0 max-w-full space-y-3 px-1 py-1 md:px-1.5 md:py-1.5">
      <h1 className="text-xl font-semibold tracking-tight">主播明细</h1>
      <AnchorTable />
    </div>
  );
}
