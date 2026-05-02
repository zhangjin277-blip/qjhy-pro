import { CookiePanel } from "./_components/cookie-panel";
import { QueueStatus } from "./_components/queue-status";
import { ManualRerun } from "./_components/manual-rerun";

export default function CrawlerAdminPage(): React.JSX.Element {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">采集监控</h1>
      <ManualRerun />
      <QueueStatus />
      <CookiePanel />
    </div>
  );
}
