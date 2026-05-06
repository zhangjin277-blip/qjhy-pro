import { getBatchDetail } from "@/modules/placement/server";
import { notFound } from "next/navigation";

export default async function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const batch = await getBatchDetail(id);
  if (!batch) notFound();

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">批次详情：{batch.file_name}</h1>

      <dl className="grid grid-cols-2 gap-2 rounded border border-slate-200 bg-white p-4 text-sm">
        <dt className="text-slate-500">来源</dt>
        <dd>{batch.source}</dd>
        <dt className="text-slate-500">产品</dt>
        <dd>{batch.dataset_id}</dd>
        <dt className="text-slate-500">日期范围</dt>
        <dd>
          {batch.date_range_from} ~ {batch.date_range_to}
        </dd>
        <dt className="text-slate-500">行数</dt>
        <dd>
          总 {batch.row_count} / 新增 {batch.rows_inserted} / 更新 {batch.rows_updated} / 跳过{" "}
          {batch.rows_skipped}
        </dd>
        <dt className="text-slate-500">状态</dt>
        <dd>{batch.status}</dd>
        <dt className="text-slate-500">上传时间</dt>
        <dd>{new Date(batch.uploaded_at).toLocaleString("zh-CN")}</dd>
      </dl>

      {batch.error_log && batch.error_log.length > 0 && (
        <div className="rounded border border-red-200 bg-red-50 p-4">
          <h2 className="font-medium text-red-900 mb-2">错误明细 ({batch.error_log.length})</h2>
          <ul className="space-y-1 text-sm">
            {batch.error_log.map((e, i) => (
              <li key={i} className="text-red-700">
                {e.reason}
                {e.row !== undefined && (
                  <span className="ml-2 text-xs text-red-500 font-mono">
                    {JSON.stringify(e.row).slice(0, 200)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
