import { Workbench } from "./_components/workbench";

export default async function DashboardPage(): Promise<React.JSX.Element> {
  return (
    <div className="min-w-0 max-w-full space-y-3 px-1 py-1 md:px-1.5 md:py-1.5">
      <Workbench />
    </div>
  );
}
