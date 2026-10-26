"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { WorkbenchData, PersonalCalendar, CalendarStatus } from "@/modules/dashboard";
import { monthBounds } from "@/modules/dashboard";
import base from "./workbench.module.css";
import styles from "./workbench-management.module.css";
const legends: [CalendarStatus, string][] = [
  ["normal", "正常"],
  ["late", "迟到"],
  ["early", "早退"],
  ["missing", "缺卡"],
  ["leave", "请假"],
  ["outing", "外出"],
  ["repair", "补卡"],
  ["absent", "缺勤"],
];
export function WorkbenchAttendance({
  data,
  refreshKey,
}: {
  data: WorkbenchData;
  refreshKey: number;
}) {
  const [tab, setTab] = useState("mine");
  const [month, setMonth] = useState(data.today.slice(0, 7));
  const [calendar, setCalendar] = useState<PersonalCalendar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/workbench/attendance?month=${month}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "个人考勤加载失败");
        if (!controller.signal.aborted) setCalendar(json);
      } catch (reason) {
        if (!controller.signal.aborted) {
          setCalendar(null);
          setError(reason instanceof Error ? reason.message : "加载失败");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [month, refreshKey]);
  function changeMonth(delta: number) {
    const [y = 2000, m = 1] = month.split("-").map(Number);
    setMonth(new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7));
    setSelected(null);
  }
  const team = data.attendance.data?.team;
  const day = calendar?.days.find((d) => d.date === selected);
  const shown = calendar?.month === month ? calendar : null;
  return (
    <section id="workbench-attendance" className={base.panel}>
      <header className={base.panelHeader}>
        <h2>
          <Clock3 />
          {tab === "mine" ? "我的考勤" : "考勤概况"}
        </h2>
        <div className={base.segment}>
          {[
            ["mine", "我的"],
            ["team", data.attendance.data?.scopeLabel === "全员范围" ? "全员" : "部门"],
          ].map(([key, label]) => (
            <button
              type="button"
              key={key}
              aria-pressed={tab === key}
              onClick={() => setTab(key ?? "mine")}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      {tab === "mine" ? (
        <div className={styles.calendarBody}>
          <div className={styles.monthBar}>
            <span>{shown?.name || "个人月历"}</span>
            <div>
              <button type="button" onClick={() => changeMonth(-1)} aria-label="上个月">
                <ChevronLeft size={16} />
              </button>
              <b>{month}</b>
              <button type="button" onClick={() => changeMonth(1)} aria-label="下个月">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className={styles.calendarWeek}>
            {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className={styles.calendarGrid} aria-label={`${month}考勤月历`} aria-busy={loading}>
            {Array.from({ length: monthBounds(month).offset }, (_, i) => (
              <span key={`space${i}`} />
            ))}
            {Array.from({ length: Number(monthBounds(month).end.slice(8)) }, (_, i) => {
              const date = `${month}-${String(i + 1).padStart(2, "0")}`;
              const entry = shown?.days[i];
              return (
                <button
                  type="button"
                  key={date}
                  className={`${styles.calendarDay} ${styles[entry?.status || "none"]} ${date === data.today ? styles.today : ""}`}
                  disabled={
                    loading ||
                    !entry ||
                    (entry.status === "none" && !entry.on && !entry.off && !entry.approvals.length)
                  }
                  aria-label={`${date} ${legends.find(([key]) => key === entry?.status)?.[1] || (entry?.status === "rest" ? "休息" : entry?.status === "explained" ? "已说明" : "暂无记录")}`}
                  onClick={() => setSelected(date)}
                >
                  {entry?.label || i + 1}
                </button>
              );
            })}
          </div>
          {(loading || error || shown?.unavailable) && (
            <p className={styles.calendarMessage} role={error ? "alert" : undefined}>
              {loading ? "正在加载考勤…" : error || shown?.unavailable}
            </p>
          )}
          <div className={styles.calendarTotals}>
            {legends.slice(0, 5).map(([key, label]) => (
              <span key={key} className={styles[`${key}Text`]}>
                {label}{" "}
                <b>
                  {loading || !shown || shown.unavailable
                    ? "—"
                    : shown.days.filter((d) => d.status === key).length}
                </b>
              </span>
            ))}
          </div>
          <div className={styles.legend}>
            {legends.map(([key, label]) => (
              <span key={key}>
                <i className={styles[key]} />
                {label}
              </span>
            ))}
          </div>
          <p className={base.attendanceNote}>按已同步记录统计 · 点击日期查看明细</p>
        </div>
      ) : data.attendance.error ? (
        <div className={base.empty}>{data.attendance.error}</div>
      ) : (
        team && (
          <div className={base.attendanceBody}>
            <div className={base.attendanceDate}>
              <b>{data.yesterday} · 昨日考勤</b>
              <span>{data.attendance.data?.scopeLabel}</span>
            </div>
            <div className={base.attendanceStats}>
              <div>
                <strong>{team.recorded}</strong>
                <span>有出勤记录</span>
              </div>
              <div>
                <strong className={base.good}>{team.normal}</strong>
                <span>正常人数</span>
              </div>
              <div>
                <strong className={base.warn}>{team.pending}</strong>
                <span>异常待核实</span>
              </div>
            </div>
            <div className={base.attendanceLine}>
              <span>迟到 / 早退</span>
              <b>
                {team.late} / {team.early} 人待核实
              </b>
            </div>
            <div className={base.attendanceLine}>
              <span>缺卡 / 旷工</span>
              <b>
                {team.missing} / {team.absent} 人待核实
              </b>
            </div>
            <p className={base.attendanceNote}>按已有考勤记录统计 · 今日记录以同步结果为准</p>
          </div>
        )
      )}
      <footer className={base.panelFoot}>
        <span>考勤明细与排班</span>
        <Link href="/attendance" className={base.textLink}>
          查看考勤 ›
        </Link>
      </footer>
      <Dialog
        open={!!day}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent>
          <DialogTitle>{day?.date} · 考勤明细</DialogTitle>
          <DialogDescription>沿用考勤中心的排班、弹性与核实规则</DialogDescription>
          {day && (
            <div className="space-y-3 text-sm">
              <p>
                状态：
                {legends.find(([key]) => key === day.status)?.[1] ||
                  (day.status === "rest"
                    ? "休息"
                    : day.status === "explained"
                      ? "已说明"
                      : "记录待完整")}
              </p>
              <p>上班：{day.on || "无记录"}</p>
              <p>下班：{day.off || "无记录"}</p>
              {day.remark && <p>说明：{day.remark}</p>}
              {day.approvals.map((a, i) => (
                <p key={i}>
                  审批：{a.type} · {a.start} 至 {a.end || a.start}
                  {a.reason ? ` · ${a.reason}` : ""}
                </p>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
