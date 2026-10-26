"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCheck, ClipboardCheck, RefreshCw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WorkbenchData, ManagementData, ApprovalPreview } from "@/modules/dashboard";
import { DashboardBoard } from "./dashboard-board";
import { WorkbenchNotices } from "./workbench-notices";
import { WorkbenchAttendance } from "./workbench-attendance";
import { WorkbenchApproval } from "./workbench-approval";
import { WorkbenchPersonnel } from "./workbench-management";
import { WorkbenchRanking } from "./workbench-ranking";
import managementStyles from "./workbench-management.module.css";
import { WorkbenchGoals } from "./workbench-goals";
import styles from "./workbench.module.css";

const procurementStatus: Record<string, string> = {
  pending_approval: "待审批",
  pending: "待采购",
  purchased: "已采购",
  shipped: "已发货",
  received: "已收货",
  returned: "已退货",
  rejected: "已拒绝",
};
export function Workbench() {
  const [data, setData] = useState<WorkbenchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState("overview");
  const [approvalTab, setApprovalTab] = useState("pending");
  const [management, setManagement] = useState<ManagementData | null>(null);
  const [managementError, setManagementError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [approvalItem, setApprovalItem] = useState<ApprovalPreview | null>(null);

  const reload = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const managementRequest = fetch("/api/workbench/management", { cache: "no-store", signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("人员与剪辑概览加载失败");
          return response.json() as Promise<ManagementData>;
        })
        .then((next) => {
          if (!signal?.aborted) {
            setManagement(next);
            setManagementError(null);
          }
        })
        .catch((reason) => {
          if (!signal?.aborted)
            setManagementError(reason instanceof Error ? reason.message : "概览加载失败");
        });
      const response = await fetch("/api/workbench", { cache: "no-store", signal });
      await managementRequest;
      if (!response.ok)
        throw new Error(
          response.status === 401 ? "登录已失效，请重新登录" : "工作台加载失败，请重试",
        );
      const next = (await response.json()) as WorkbenchData;
      if (!signal?.aborted) {
        setData(next);
        setError(null);
        setRefreshKey((key) => key + 1);
      }
    } catch (reason) {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "加载失败");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);
  const refresh = useCallback(() => reload(), [reload]);

  const approvals = data?.approvals.data;
  const approvalRows = approvalTab === "pending" ? approvals?.pending : approvals?.mine;
  return (
    <div className={styles.workbench}>
      <header className={styles.heading}>
        <div>
          <h1>工作台</h1>
        </div>
        <div className={styles.headingActions}>
          <button
            type="button"
            className={styles.refresh}
            disabled={loading}
            onClick={() => void refresh()}
            aria-label="刷新工作台"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>
      <Tabs value={view} onValueChange={(value) => setView(String(value))}>
        <div className={styles.viewBar}>
          <TabsList variant="line">
            <TabsTrigger value="overview">工作概览</TabsTrigger>
            <TabsTrigger value="business">业务看板</TabsTrigger>
          </TabsList>
          <span>
            {data?.today ?? ""} ·{" "}
            {loading ? "正在更新" : view === "business" ? "业务看板" : "工作概览"}
          </span>
        </div>
        <TabsContent value="overview">
          {error && (
            <div role="alert" className={styles.error}>
              {error}
              <button type="button" onClick={() => void refresh()}>
                重新加载
              </button>
            </div>
          )}
          {!data ? (
            <div className={styles.loading}>{loading ? "正在加载工作台…" : "请刷新重试"}</div>
          ) : (
            <div className={styles.panelGrid}>
              <div className={`${managementStyles.column} ${managementStyles.mainColumn}`}>
                <WorkbenchGoals refreshKey={refreshKey} />
                <WorkbenchRanking refreshKey={refreshKey} />
                <WorkbenchPersonnel data={management} error={managementError} />
              </div>
              <aside
                className={`${managementStyles.column} ${managementStyles.utilityColumn}`}
                aria-label="日常办公"
              >
                <WorkbenchNotices section={data.notices} reload={refresh} />
                <WorkbenchAttendance data={data} refreshKey={refreshKey} />
                <section id="workbench-approvals" className={styles.panel}>
                  <header className={styles.panelHeader}>
                    <h2>
                      <ClipboardCheck />
                      审批中心
                    </h2>
                    {approvals?.canCreate && (
                      <Link href="/procurement" className={styles.textLink}>
                        发起采购申请 ›
                      </Link>
                    )}
                  </header>
                  <Tabs
                    value={approvalTab}
                    onValueChange={(value) => setApprovalTab(String(value))}
                  >
                    <TabsList variant="line" className={styles.smallTabs}>
                      <TabsTrigger value="pending">
                        待我审批
                        {approvals?.canApprove && (
                          <span className={styles.badge}>{approvals.pendingCount}</span>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="mine">
                        我的申请
                        {approvals && <span className={styles.badge}>{approvals.mineCount}</span>}
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value={approvalTab}>
                      {data.approvals.error ? (
                        <div className={styles.empty}>{data.approvals.error}</div>
                      ) : approvalTab === "pending" && !approvals?.canApprove ? (
                        <div className={styles.empty}>
                          <CheckCheck size={26} />
                          <p>暂无审批办理权限</p>
                          <span>可在「我的申请」查看自己提交的采购</span>
                        </div>
                      ) : !approvalRows?.length ? (
                        <div className={styles.empty}>
                          <CheckCheck size={26} />
                          <p>
                            {approvalTab === "pending"
                              ? "当前没有待处理的采购审批"
                              : "你还没有提交采购申请"}
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className={styles.rowList}>
                            {approvalRows.map((item) => (
                              <div key={item.id} className={styles.compactApprovalRow}>
                                <div className={styles.subject}>
                                  <span className={styles.typeIcon}>采</span>
                                  <div className="min-w-0">
                                    <div className={styles.itemTitle}>{item.title}</div>
                                    <div className={styles.itemSub}>
                                      ¥
                                      {item.amount.toLocaleString("zh-CN", {
                                        maximumFractionDigits: 2,
                                      })}{" "}
                                      · {item.submitter}
                                    </div>
                                    <div className={styles.itemSub}>
                                      {procurementStatus[item.status] ?? item.status} ·{" "}
                                      {new Date(item.createdAt).toLocaleDateString("zh-CN", {
                                        timeZone: "Asia/Shanghai",
                                        month: "2-digit",
                                        day: "2-digit",
                                      })}
                                    </div>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className={styles.processButton}
                                  onClick={() => setApprovalItem(item)}
                                >
                                  {approvalTab === "pending" ? "快捷审批" : "查看"}
                                </button>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </TabsContent>
                  </Tabs>
                  <footer className={styles.panelFoot}>
                    <span>已接入采购审批</span>
                    {approvals && (
                      <Link href="/procurement" className={styles.textLink}>
                        查看全部采购 ›
                      </Link>
                    )}
                  </footer>
                </section>
              </aside>
            </div>
          )}
        </TabsContent>
        <TabsContent value="business">
          <DashboardBoard />
        </TabsContent>
      </Tabs>
      <WorkbenchApproval
        key={approvalItem?.id ?? "closed"}
        item={approvalItem}
        canApprove={!!approvals?.canApprove && approvalItem?.status === "pending_approval"}
        close={() => setApprovalItem(null)}
        reload={refresh}
      />
    </div>
  );
}
