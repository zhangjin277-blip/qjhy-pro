/**
 * DataToolbar · 业务页面配方
 *
 * 数据看板顶部「筛选 + 操作」行的统一实现。所有数据板块的顶部 toolbar 都用 DataToolbar，
 * 不允许自己写 flex justify-between className。
 *
 * 视觉规范：
 * - 容器: flex flex-wrap items-center justify-between gap-2
 * - 左侧 filters: flex flex-wrap items-center gap-2 + min-w-0 (允许子元素 shrink)
 * - 右侧 actions: flex shrink-0 items-center gap-2 (按钮组保持不被压缩)
 *
 * API：filters / actions 用 ReactNode slot。filters 内部建议用 shadcn Input/Button/Select
 * 或 PresetChip 的组合；actions 内部建议用 Button size="sm"。
 *
 * 用法：
 *   <DataToolbar
 *     filters={
 *       <>
 *         <DateRangeInputs />
 *         <PresetButtons />
 *         <ProjectSelect />
 *         <SearchInput />
 *       </>
 *     }
 *     actions={
 *       <>
 *         <CompareToggle />
 *         <CsvExportButton />
 *         <Button size="sm" variant="outline">自定义列</Button>
 *       </>
 *     }
 *   />
 */
import { cn } from "@/lib/utils/cn";

interface DataToolbarProps {
  filters: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function DataToolbar({ filters, actions, className }: DataToolbarProps) {
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center justify-between gap-2", className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{filters}</div>
      {actions != null && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
