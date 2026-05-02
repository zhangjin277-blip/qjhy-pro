import { BrokerTable } from "./_components/broker-table";

export default function BrokersAdminPage(): React.JSX.Element {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">经纪人映射</h1>
      <p className="text-sm text-muted-foreground">
        把抖音平台的运营经纪人和钉钉用户对应起来。每天同步后自动 fuzzy match，可手动改写。
      </p>
      <BrokerTable />
    </div>
  );
}
