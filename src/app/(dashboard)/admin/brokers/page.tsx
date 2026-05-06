import { BrokerTable } from "./_components/broker-table";

export default function BrokersAdminPage(): React.JSX.Element {
  return (
    <div className="space-y-3 px-1 py-1 md:px-1.5 md:py-1.5">
      <h1 className="text-xl font-semibold tracking-tight">经纪人映射</h1>
      <p className="text-sm text-muted-foreground">
        把抖音平台的运营经纪人和钉钉用户对应起来。每天同步后自动 fuzzy match，可手动改写。
      </p>
      <BrokerTable />
    </div>
  );
}
