import { CookiePanel } from "./_components/cookie-panel";
import { QueueStatus } from "./_components/queue-status";
import { ManualRerun } from "./_components/manual-rerun";

export default function CrawlerAdminPage(): React.JSX.Element {
  return (
    <div className="space-y-3 px-1 py-1 md:px-1.5 md:py-1.5">
      <h1 className="text-xl font-semibold tracking-tight">采集监控</h1>
      <ManualRerun />
      <QueueStatus />
      <CookiePanel />
    </div>
  );
}
