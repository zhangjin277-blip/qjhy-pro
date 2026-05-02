"use client";

import { useEffect, useState } from "react";
import { Filters } from "./filters";
import { CsvExportButton } from "./csv-export";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AnchorListRow, AnchorListFilters } from "@/modules/anchors";

const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

export function AnchorTable(): React.JSX.Element {
  const [filters, setFilters] = useState<AnchorListFilters>({
    date_from: yesterday,
    date_to: yesterday,
    project: "all",
  });
  const [rows, setRows] = useState<AnchorListRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const sp = new URLSearchParams();
    sp.set("date_from", filters.date_from);
    sp.set("date_to", filters.date_to);
    if (filters.project) sp.set("project", filters.project);
    if (filters.search) sp.set("search", filters.search);
    setLoading(true);
    fetch(`/api/anchors?${sp.toString()}`)
      .then((r) => r.json() as Promise<{ rows: AnchorListRow[] }>)
      .then((d) => setRows(d.rows))
      .finally(() => setLoading(false));
  }, [filters]);

  const isRange = filters.date_from !== filters.date_to;
  const totalRow = rows.reduce(
    (acc, r) => ({
      ticket: acc.ticket + (r.total_fan_ticket ?? 0),
      duration: acc.duration + (r.live_duration ?? 0),
      fans: acc.fans + (r.new_follow_fans ?? 0),
    }),
    { ticket: 0, duration: 0, fans: 0 },
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Filters filters={filters} onChange={setFilters} />
        <CsvExportButton rows={rows} />
      </div>

      <div className="text-muted-foreground flex gap-6 text-sm">
        <span>
          范围 <strong>{filters.date_from}</strong>
          {isRange && (
            <>
              {" "}
              ~ <strong>{filters.date_to}</strong>
            </>
          )}
        </span>
        <span>主播 {rows.length}</span>
        <span>总音浪 {totalRow.ticket.toLocaleString("zh-CN")}</span>
        <span>总时长 {totalRow.duration.toFixed(1)}h</span>
        <span>总涨粉 {totalRow.fans.toLocaleString("zh-CN")}</span>
      </div>

      <div className="bg-card overflow-x-auto rounded-lg border">
        <Table className="min-w-max">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-card">昵称</TableHead>
              <TableHead>项目</TableHead>
              <TableHead>运营经纪人</TableHead>
              <TableHead>招募经纪人</TableHead>
              <TableHead className="text-right">健康分</TableHead>
              <TableHead className="text-right">粉丝数</TableHead>

              <TableHead className="text-right">总音浪</TableHead>
              <TableHead className="text-right">礼物音浪</TableHead>
              <TableHead className="text-right">道具音浪</TableHead>
              <TableHead className="text-right">嘉宾音浪</TableHead>
              <TableHead className="text-right">活动音浪</TableHead>
              <TableHead className="text-right">其他音浪</TableHead>
              <TableHead className="text-right">会员订阅音浪</TableHead>
              <TableHead className="text-right">星守护音浪</TableHead>

              <TableHead className="text-right">开播时长</TableHead>
              <TableHead className="text-right">有效时长</TableHead>
              <TableHead className="text-right">开播天</TableHead>
              <TableHead className="text-right">个播有效天</TableHead>
              <TableHead className="text-right">涨粉</TableHead>
              <TableHead className="text-right">人气峰值</TableHead>
              <TableHead className="text-right">feed看播</TableHead>
              <TableHead className="text-right">feed_acu</TableHead>

              <TableHead className="text-right">视频播放</TableHead>
              <TableHead className="text-right">视频点赞</TableHead>
              <TableHead className="text-right">视频评论</TableHead>

              <TableHead className="text-right">小游戏分账</TableHead>
              <TableHead className="text-right">推广游戏分账</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={26} className="text-center text-sm text-muted-foreground">
                  加载中...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={26} className="text-center text-sm text-muted-foreground">
                  无数据
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.anchor_id}>
                  <TableCell className="sticky left-0 bg-card">{r.nick_name}</TableCell>
                  <TableCell>{r.is_threekingdoms ? "三国" : "斗地主"}</TableCell>
                  <TableCell>{r.broker_name ?? "—"}</TableCell>
                  <TableCell>{r.recruit_broker_name ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.anchor_health_score ?? "—"}</TableCell>
                  <TableCell className="text-right">{fmt(r.total_fans)}</TableCell>

                  <TableCell className="text-right font-medium">
                    {fmt(r.total_fan_ticket)}
                  </TableCell>
                  <TableCell className="text-right">{fmt(r.live_fan_ticket_no_guest)}</TableCell>
                  <TableCell className="text-right">
                    {fmt(r.property_fan_ticket_no_guest)}
                  </TableCell>
                  <TableCell className="text-right">{fmt(r.guest_fan_ticket)}</TableCell>
                  <TableCell className="text-right">
                    {fmt(r.activity_fan_ticket_no_guest)}
                  </TableCell>
                  <TableCell className="text-right">{fmt(r.special_fan_ticket)}</TableCell>
                  <TableCell className="text-right">{fmt(r.subscribe_fan_ticket)}</TableCell>
                  <TableCell className="text-right">{fmt(r.star_guard_earn_score)}</TableCell>

                  <TableCell className="text-right">{durh(r.live_duration)}</TableCell>
                  <TableCell className="text-right">{durh(r.valid_live_duration)}</TableCell>
                  <TableCell className="text-right">{r.live_days ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.solo_valid_days ?? "—"}</TableCell>
                  <TableCell className="text-right">{fmt(r.new_follow_fans)}</TableCell>
                  <TableCell className="text-right">{fmt(r.peak_per_minute_ucnt)}</TableCell>
                  <TableCell className="text-right">{durh(r.feed_watch_duration)}</TableCell>
                  <TableCell className="text-right">{fmt(r.feed_acu)}</TableCell>

                  <TableCell className="text-right">{fmt(r.video_view_count)}</TableCell>
                  <TableCell className="text-right">{fmt(r.video_like_count)}</TableCell>
                  <TableCell className="text-right">{fmt(r.video_comment_count)}</TableCell>

                  <TableCell className="text-right">{fmt(r.minigame_income)}</TableCell>
                  <TableCell className="text-right">{fmt(r.game_income)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function fmt(n: number | null): string {
  if (n === null || n === 0) return "—";
  return n.toLocaleString("zh-CN");
}

function durh(n: number | null): string {
  if (n === null || n === 0) return "—";
  return `${n.toFixed(1)}h`;
}
