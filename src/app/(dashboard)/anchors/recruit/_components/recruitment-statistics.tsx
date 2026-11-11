"use client";

import { useEffect, useState } from "react";

import { KpiGrid } from "@/components/patterns/kpi-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  shanghaiMonth,
  type RecruitmentStatisticsData,
  getRecruitmentStatisticsAction,
} from "@/modules/business-recruitment";

const METRICS = {
  all: "全部主播",
  joined: "当月入会",
  qualified: "有效主播",
  active: "有效开播",
} as const;

export function RecruitmentStatistics() {
  const [month, setMonth] = useState(shanghaiMonth);
  const [recruiter, setRecruiter] = useState("all");
  const [request, setRequest] = useState<{
    month: string;
    version: number;
    recruiterUserId?: string;
  }>({ month: shanghaiMonth(), version: 0 });
  const [result, setResult] = useState<RecruitmentStatisticsData | null>(null);
  const [error, setError] = useState("");
  const [metric, setMetric] = useState<keyof typeof METRICS>("all");
  const [page, setPage] = useState(1);
  const [detailOwner, setDetailOwner] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    getRecruitmentStatisticsAction({
      month: request.month,
      ...(request.recruiterUserId ? { recruiterUserId: request.recruiterUserId } : {}),
    })
      .then((response) => {
        if (cancelled) return;
        if (response.ok) {
          setResult(response.data);
          setError("");
        } else {
          setResult(null);
          setError(response.error);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError("加载失败，请重试");
          setResult(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [request]);
  const details = (result?.details ?? []).filter(
    (row) =>
      (!detailOwner || row.recruiterUserId === detailOwner) && (metric === "all" || row[metric]),
  );
  const totals = (result?.summaries ?? []).reduce(
    (sum, row) => ({
      joined: sum.joined + row.joined,
      qualified: sum.qualified + row.qualified,
      active: sum.active + row.active,
    }),
    { joined: 0, qualified: 0, active: 0 },
  );
  const pageCount = Math.max(1, Math.ceil(details.length / 20));
  return (
    <section aria-label="线上招募月度统计" className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setLoading(true);
          setError("");
          setPage(1);
          setDetailOwner(null);
          setRequest((previous) => ({
            month,
            version: previous.version + 1,
            recruiterUserId: recruiter === "all" ? undefined : recruiter,
          }));
        }}
      >
        <label className="space-y-1 text-sm">
          <span>统计月份</span>
          <Input
            type="month"
            id="recruitment-statistics-month"
            required
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </label>
        <div className="space-y-1 text-sm">
          <span>经纪人</span>
          <Select value={recruiter} onValueChange={(value) => setRecruiter(value ?? "all")}>
            <SelectTrigger
              id="recruitment-statistics-recruiter"
              aria-label="统计经纪人"
              className="w-44"
            >
              <SelectValue>
                {() =>
                  recruiter === "all"
                    ? result?.canViewAll
                      ? "全部经纪人"
                      : result?.canViewTeam
                        ? "管理范围内经纪人"
                        : "本人"
                    : (result?.recruiters.find((item) => item.userId === recruiter)?.name ?? "本人")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {result?.canViewAll
                  ? "全部经纪人"
                  : result?.canViewTeam
                    ? "管理范围内经纪人"
                    : "本人"}
              </SelectItem>
              {result?.recruiters.map((item) => (
                <SelectItem key={item.userId} value={item.userId}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? "统计中…" : "查询统计"}
        </Button>
        <span className="pb-2 text-xs text-muted-foreground">
          {result?.canViewAll
            ? "管理员可查看全部经纪人"
            : result?.canViewTeam
              ? "显示本人及管理部门、子部门经纪人负责招募的主播"
              : "仅显示本人负责招募的主播"}
        </span>
      </form>
      <div className="rounded-lg border bg-slate-50 p-3 text-xs leading-6 text-slate-600">
        <p>当月入会：入会日期在统计月份内。</p>
        <p>
          有效主播：入会后累计开播≥7天且总时长≥14小时，计入首次达标月，每个主播只计一次，支持跨月累计。
        </p>
        <p>有效开播：统计月内开播≥20天且总时长≥60小时，每月独立统计，不限入会月份。</p>
        <p>
          按北京时间自然日去重，时长取平台“开播总时长”。例如10月30日入会、10月31日起开播，11月6日首次达标，计入11月有效主播。
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {!loading && result && (
        <>
          <p className="text-sm text-muted-foreground">
            统计月份：{result.month} · 直播数据最新日期：{result.lastDataDate ?? "暂无数据"}
            。历史直播数据未采集完整时，首次达标日期可能延后；未匹配、身份冲突及非抖音账号不计直播达标人数。
          </p>
          {(!result.lastDataDate || result.lastDataDate.slice(0, 7) < result.month) && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              所选月份暂无已采集的直播数据，当前达标人数不代表实际结果。请在采集数据更新后重新查询。
            </p>
          )}
          {result.details.some((row) => row.historyIncomplete) && (
            <p className="text-sm text-amber-700">
              部分主播首播早于已采集历史，首次达标月暂列待核对，不计入有效主播人数，避免重复计奖。
            </p>
          )}
          <div className="[&>div]:lg:grid-cols-3">
            <KpiGrid
              items={[
                { key: "joined", label: "当月入会人数", value: totals.joined },
                {
                  key: "qualified",
                  label: "有效主播人数（7天 / 14小时）",
                  value: totals.qualified,
                },
                { key: "active", label: "有效开播人数（20天 / 60小时）", value: totals.active },
              ]}
            />
          </div>
          {result.unmatched > 0 && (
            <p className="text-sm text-amber-700">
              有 {result.unmatched}{" "}
              个账号未唯一匹配直播数据，请在主播明细核对。入会人数仍按登记的入会日期统计。
            </p>
          )}
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>统计月份</TableHead>
                  <TableHead>经纪人</TableHead>
                  <TableHead>当月入会人数</TableHead>
                  <TableHead>有效主播人数</TableHead>
                  <TableHead>有效开播人数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.summaries.map((row) => (
                  <TableRow key={row.recruiterUserId}>
                    <TableCell>{result.month}</TableCell>
                    <TableCell>{row.recruiterName}</TableCell>
                    {(["joined", "qualified", "active"] as const).map((key) => (
                      <TableCell key={key}>
                        <button
                          className="text-primary underline underline-offset-4"
                          onClick={() => {
                            setMetric(key);
                            setDetailOwner(row.recruiterUserId);
                            setPage(1);
                          }}
                        >
                          {row[key]}
                        </button>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {!result.summaries.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      暂无本人招募记录
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="mr-2 text-sm font-semibold">
              主播明细
              {detailOwner
                ? ` · ${result.recruiters.find((item) => item.userId === detailOwner)?.name ?? ""}`
                : ""}
            </h3>
            {Object.entries(METRICS).map(([key, label]) => (
              <Button
                key={key}
                size="sm"
                variant={metric === key ? "default" : "outline"}
                onClick={() => {
                  setMetric(key as keyof typeof METRICS);
                  if (key === "all") setDetailOwner(null);
                  setPage(1);
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    "登记姓名",
                    "经纪人",
                    "抖音号 / 账号",
                    "入会日期",
                    "当月开播天数",
                    "当月直播时长",
                    "首次7天14小时达标",
                    "当月入会",
                    "有效主播",
                    "有效开播",
                  ].map((label) => (
                    <TableHead key={label}>{label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {details.slice((page - 1) * 20, page * 20).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.anchorName}</TableCell>
                    <TableCell>{row.recruiterName}</TableCell>
                    <TableCell>
                      {row.accountId}
                      {!row.anchorId && <p className="text-xs text-amber-700">未匹配 / 待核对</p>}
                    </TableCell>
                    <TableCell>{row.joinDate ?? "未匹配"}</TableCell>
                    <TableCell>{row.anchorId ? `${row.liveDays} 天` : "—"}</TableCell>
                    <TableCell>{row.anchorId ? `${row.liveHours.toFixed(2)} 小时` : "—"}</TableCell>
                    <TableCell>
                      {row.historyIncomplete
                        ? "历史不足，待核对"
                        : !row.anchorId
                          ? "未匹配"
                          : !row.joinDate
                            ? "缺少入会日期"
                            : (row.qualifiedDate ?? "未达标")}
                    </TableCell>
                    {(["joined", "qualified", "active"] as const).map((key) => (
                      <TableCell key={key}>
                        <span
                          className={
                            row[key] ? "font-medium text-emerald-700" : "text-muted-foreground"
                          }
                        >
                          {row[key] ? "是" : "否"}
                        </span>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {!details.length && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground">
                      该月份暂无符合条件的主播
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-end gap-3 text-sm">
            <span>
              共 {details.length} 人 · 第 {page} / {pageCount} 页
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              aria-label="统计上一页"
              onClick={() => setPage(page - 1)}
            >
              上一页
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= pageCount}
              aria-label="统计下一页"
              onClick={() => setPage(page + 1)}
            >
              下一页
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
