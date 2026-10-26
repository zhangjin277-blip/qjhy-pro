"use client";
import { useState } from "react";
import Link from "next/link";
import { Scissors, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { ManagementData } from "@/modules/dashboard";
import base from "./workbench.module.css";
import styles from "./workbench-management.module.css";
const statusLabels = {
  regular: "正式",
  probation: "试用期",
  inactive: "已离职",
  unknown: "状态待维护",
};
export function WorkbenchPersonnel({
  data,
  error,
}: {
  data: ManagementData | null;
  error: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const section = data?.personnel;
  const rows = section?.data?.departments;
  const department = rows?.find((row) => row.id === selected);
  const scope = selected === "all" ? rows : department ? [department] : [];
  const members = scope
    ?.flatMap((row) => row.members.map((member) => ({ ...member, departmentName: row.name })))
    .filter(
      (m) =>
        filter === "all" ||
        (filter === "active" && m.status !== "inactive") ||
        (filter === "probation" && m.status === "probation") ||
        (filter === "hired" && m.firstSyncedDate?.startsWith(data?.month || "!")) ||
        (filter === "departed" && m.lastInactiveDate?.startsWith(data?.month || "!")) ||
        (filter === "absent" && m.status !== "inactive" && m.absent) ||
        (filter === "leave" && m.status !== "inactive" && m.leave) ||
        (filter === "inactive" && m.status === "inactive"),
    );
  function openDetails(departmentId: string, category = "all") {
    setSelected(departmentId);
    setFilter(category);
  }
  const metrics = rows
    ? [
        { key: "active", label: "在职人员", value: rows.reduce((n, r) => n + r.active, 0) },
        { key: "probation", label: "试用期", value: rows.reduce((n, r) => n + r.probation, 0) },
        { key: "hired", label: "本月入职", value: rows.reduce((n, r) => n + r.hired, 0) },
        { key: "departed", label: "本月离职", value: rows.reduce((n, r) => n + r.departed, 0) },
        {
          key: "absent",
          label: "昨日缺勤",
          value: rows.every((r) => r.absent !== null)
            ? rows.reduce((n, r) => n + (r.absent ?? 0), 0)
            : null,
        },
        {
          key: "leave",
          label: "昨日请假",
          value: rows.every((r) => r.leave !== null)
            ? rows.reduce((n, r) => n + (r.leave ?? 0), 0)
            : null,
        },
      ]
    : [];
  // Wait for authorization before mounting the card; denied users see no empty placeholder.
  if ((!section && !error) || section?.hidden) return null;
  return (
    <section id="workbench-personnel" className={base.panel}>
      <header className={base.panelHeader}>
        <h2>
          <Users />
          部门人员概览<span className={base.caption}>人员结构与入离职</span>
        </h2>
        <span className={base.caption}>{data?.month}</span>
      </header>
      {!rows ? (
        <div className={base.empty}>{error || section?.error || "正在加载人员情况…"}</div>
      ) : (
        <>
          <div className={styles.personnelSummary}>
            {metrics.map((metric) => (
              <button type="button" key={metric.key} onClick={() => openDetails("all", metric.key)}>
                <span>{metric.label}</span>
                <strong>
                  {metric.value ?? "—"}
                  <small>{metric.value === null ? "不可用" : "人"}</small>
                </strong>
                <em>查看详情 ›</em>
              </button>
            ))}
          </div>
          <div className={styles.departmentHeading}>
            <span>各部门人员</span>
            <button type="button" onClick={() => openDetails("all")}>
              查看全部人员 ›
            </button>
          </div>
          <div className={styles.departmentGrid}>
            {rows.map((row) => (
              <button
                type="button"
                key={row.id}
                className={styles.departmentCard}
                title={row.originalName || row.name}
                onClick={() => openDetails(row.id)}
                aria-label={`${row.name}，在职 ${row.active} 人，查看人员详情`}
              >
                <div>
                  <span>{row.name}</span>
                  <b>
                    {row.active}
                    <small>人</small>
                  </b>
                </div>
                <p>
                  试用 {row.probation} · 本月入职 {row.hired} · 本月离职 {row.departed} · 历史离职{" "}
                  {row.inactive}
                </p>
                <footer>
                  <span className={row.absent ? styles.warningText : ""}>
                    缺勤 {row.absent ?? "—"}
                  </span>
                  <span className={row.leave ? styles.leaveText : ""}>请假 {row.leave ?? "—"}</span>
                  <Chevron />
                </footer>
              </button>
            ))}
            {rows.length === 0 && <div className={base.empty}>暂无可见部门人员</div>}
          </div>
          <p className={styles.tableNote}>
            按首个所属部门去重 · 入离职按钉钉首次新增／离职同步日期统计，启用前未记录的不补算
            {section?.data?.attendanceNote
              ? ` · ${section.data.attendanceNote}`
              : " · 缺勤按记录、请假按已批准审批"}
          </p>
        </>
      )}
      <footer className={base.panelFoot}>
        <span>共 {rows?.length ?? "—"} 个部门 · 点击卡片查看人员明细</span>
        <Link href="/people-performance" className={base.textLink}>
          人员考核 ›
        </Link>
      </footer>
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogTitle>
            {selected === "all" ? "全部可见部门 · 人员明细" : department?.name}
          </DialogTitle>
          <DialogDescription>入离职与昨日考勤情况 · {data?.yesterday}</DialogDescription>
          <label className={styles.departmentSelect}>
            部门
            <select value={selected ?? "all"} onChange={(event) => setSelected(event.target.value)}>
              <option value="all">全部可见部门</option>
              {rows?.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.memberFilters}>
            {[
              ["all", "全部"],
              ["active", "在职"],
              ["probation", "试用期"],
              ["departed", "本月离职"],
              ["hired", "本月入职"],
              ["inactive", "已离职"],
              ["absent", "昨日缺勤"],
              ["leave", "昨日请假"],
            ].map(([key, label]) => (
              <button
                type="button"
                key={key}
                aria-pressed={filter === key}
                onClick={() => setFilter(key ?? "all")}
              >
                {label}
              </button>
            ))}
          </div>
          {(filter === "hired" || filter === "departed") && (
            <p className={styles.detailNote}>
              {filter === "hired"
                ? "本月首次同步新增的钉钉人员"
                : "本月同步发现由在职转为离职的钉钉人员"}
              ，按人员去重。历史未记录同步变化日期的不补算。
            </p>
          )}
          {(filter === "absent" || filter === "leave") && section?.data?.attendanceNote && (
            <p className={styles.detailNote}>{section.data.attendanceNote}</p>
          )}
          <div className={`${styles.tableScroll} ${styles.boundedTable}`}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>姓名 / 岗位</th>
                  <th>部门</th>
                  <th>人员状态</th>
                  <th>
                    {filter === "hired"
                      ? "钉钉新增日期"
                      : filter === "departed"
                        ? "钉钉离职日期"
                        : "入职日期"}
                  </th>
                  <th>昨日考勤</th>
                </tr>
              </thead>
              <tbody>
                {members?.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.name}
                      <small>{m.title || "岗位未维护"}</small>
                    </td>
                    <td>{m.departmentName}</td>
                    <td>{statusLabels[m.status]}</td>
                    <td>
                      {(filter === "hired"
                        ? m.firstSyncedDate
                        : filter === "departed"
                          ? m.lastInactiveDate
                          : m.hireDate) || "待维护"}
                    </td>
                    <td>
                      {m.leave
                        ? "请假"
                        : m.absent
                          ? "缺勤"
                          : m.absent === null
                            ? "—"
                            : "无缺勤／请假记录"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!members?.length && (
              <p className={base.empty}>
                {(filter === "absent" || filter === "leave") && section?.data?.attendanceNote
                  ? "当前考勤情况不可用"
                  : "该分类暂无人员"}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
function Chevron() {
  return <span aria-hidden="true"> ›</span>;
}
export function WorkbenchEditors({
  data,
  error,
}: {
  data: ManagementData | null;
  error: string | null;
}) {
  const rows = data?.editors.data?.rows;
  return (
    <section id="workbench-videos" className={base.panel}>
      <header className={base.panelHeader}>
        <h2>
          <Scissors />
          剪辑人员工作统计<span className={base.caption}>{data?.month}</span>
        </h2>
        <Link href="/editing" className={base.textLink}>
          查看明细 ›
        </Link>
      </header>
      {!rows ? (
        <div className={base.empty}>{error || data?.editors.error || "正在加载剪辑统计…"}</div>
      ) : (
        <>
          <div className={styles.staffSummary}>
            <div>
              <strong>{rows.reduce((n, r) => n + r.today, 0)}</strong>
              <span>今日交片</span>
            </div>
            <div>
              <strong>{rows.reduce((n, r) => n + r.month, 0)}</strong>
              <span>本月交片</span>
            </div>
            <div>
              <strong>{rows.reduce((n, r) => n + r.editing, 0)}</strong>
              <span>正在剪辑</span>
            </div>
            <div>
              <strong>{rows.reduce((n, r) => n + r.review, 0)}</strong>
              <span>待审核</span>
            </div>
          </div>
          <div className={`${styles.tableScroll} ${styles.boundedTable}`}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>剪辑人员</th>
                  <th>今日交片</th>
                  <th>本月交片</th>
                  <th>正在剪辑</th>
                  <th>待审核</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id}>
                    <td>
                      <span className={styles.rank}>{i + 1}</span>
                      {row.name}
                    </td>
                    <td>{row.today}</td>
                    <td>
                      <b className={styles.output}>{row.month}</b>
                    </td>
                    <td>{row.editing}</td>
                    <td>{row.review}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <div className={base.empty}>本月暂无交片或进行中的任务</div>}
          </div>
        </>
      )}
      <footer className={base.panelFoot}>
        <span>交片按上传成品日期 · 单位：条</span>
        <span>按可见任务统计</span>
      </footer>
    </section>
  );
}
