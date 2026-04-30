/**
 * Phase 0 临时演示页：用于验证 design tokens 是否生效。
 * Task 17（dashboard 骨架）会整体替换本文件。
 * 不要在此基础上添加业务功能。
 */
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="space-y-6 text-center">
        <h1 className="text-3xl font-bold">QJHY-Pro</h1>
        <p className="text-muted-foreground">新中台 · Phase 0 骨架</p>

        {/* Token 应用验证：按钮 + KPI 数字 + 涨跌色 */}
        <div className="flex gap-3 justify-center">
          <Button>主按钮</Button>
          <Button variant="secondary">次要</Button>
          <Button variant="outline">轮廓</Button>
          <Button variant="ghost">幽灵</Button>
        </div>

        <div className="rounded-lg bg-card p-6 shadow-sm border text-left max-w-sm mx-auto">
          <p className="text-sm text-muted-foreground">音浪</p>
          <p className="kpi-value">12.34万</p>
          <p className="text-sm text-muted-foreground mt-1">
            昨日同期 10.59万 <span className="change-up">+16% ▲</span>
          </p>
          <p className="text-sm text-muted-foreground">
            上周同期 16.00万 <span className="change-down">-23% ▼</span>
          </p>
        </div>
      </div>
    </main>
  );
}
