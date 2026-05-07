import { BrokerTable } from "./_components/broker-table";

export default function BrokersAdminPage(): React.JSX.Element {
  return (
    <div className="min-w-0 max-w-full space-y-3 px-1 py-1 md:px-1.5 md:py-1.5">
      <div className="flex items-center gap-1 border-b border-slate-200 pb-1">
        <span className="mr-2 px-3 py-1.5 text-sm font-semibold text-slate-700">经纪人映射</span>
      </div>
      <p className="text-sm text-muted-foreground">
        把抖音平台的运营经纪人和钉钉用户对应起来。每天同步后自动 fuzzy match，可手动改写。
      </p>
      <BrokerTable />
    </div>
  );
}
