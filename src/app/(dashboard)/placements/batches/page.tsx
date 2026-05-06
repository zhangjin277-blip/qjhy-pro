import { listBatches } from "@/modules/placement/server";
import Link from "next/link";

export default async function BatchesPage() {
  const batches = await listBatches({ limit: 50 });
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">上传批次</h1>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary border-b border-slate-200">
              {[
                "来源",
                "文件",
                "产品",
                "日期范围",
                "总行",
                "成功",
                "更新",
                "跳过",
                "状态",
                "上传人",
                "时间",
              ].map((c) => (
                <th key={c} className="px-3 py-2 text-left text-xs font-medium text-slate-500">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2">{b.source === "excel-upload" ? "Excel" : "PRO3 迁移"}</td>
                <td className="px-3 py-2">
                  <Link
                    href={`/placements/batches/${b.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {b.file_name ?? "-"}
                  </Link>
                </td>
                <td className="px-3 py-2">{b.dataset_id}</td>
                <td className="px-3 py-2">
                  {b.date_range_from} ~ {b.date_range_to}
                </td>
                <td className="px-3 py-2 text-right">{b.row_count}</td>
                <td className="px-3 py-2 text-right text-green-600">{b.rows_inserted}</td>
                <td className="px-3 py-2 text-right text-amber-600">{b.rows_updated}</td>
                <td className="px-3 py-2 text-right text-slate-400">{b.rows_skipped}</td>
                <td className="px-3 py-2">
                  <span
                    className={
                      b.status === "completed"
                        ? "text-green-600"
                        : b.status === "partial"
                          ? "text-amber-600"
                          : b.status === "failed"
                            ? "text-red-600"
                            : "text-slate-500"
                    }
                  >
                    {b.status}
                  </span>
                </td>
                <td className="px-3 py-2">{b.uploaded_by_name ?? "-"}</td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  {new Date(b.uploaded_at).toLocaleString("zh-CN")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
