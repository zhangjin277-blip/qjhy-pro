import { AnchorTable } from "./_components/anchor-table";

export default function AnchorsPage(): React.JSX.Element {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">主播明细</h1>
      <AnchorTable />
    </div>
  );
}
