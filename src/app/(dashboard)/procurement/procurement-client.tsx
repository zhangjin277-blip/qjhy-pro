/* eslint-disable @typescript-eslint/no-explicit-any */
/* Legacy procurement rows include imported fields; images use authenticated media URLs. */
/* eslint-disable @next/next/no-img-element */
"use client";
import { useEffect, useMemo, useState } from "react";

type Item = Record<string, any>;
const statuses: Record<string, string> = {
  pending_approval: "待审批",
  pending: "待购买",
  purchased: "待发货",
  shipped: "运输中",
  received: "已入库",
  returned: "已退货",
  rejected: "已拒绝",
};
const platforms = ["淘宝", "拼多多", "京东", "抖音", "1688", "线下采购"];
const usages = ["直播道具", "主播装饰", "拍摄道具", "妆造"];
const empty = {
  item_name: "",
  link: "",
  price: "",
  quantity: 1,
  requester: "",
  anchor_name: "",
  anchor_binding_id: "",
  room: "",
  platform: "淘宝",
  invoice: "可开票",
  usage: "直播道具",
  remarks: "",
  screenshots: [] as string[],
};
export function ProcurementClient({
  initialItems,
  initialStats,
  currentUserName,
}: {
  initialItems: Item[];
  initialStats: Record<string, any>;
  currentUserName: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [stats, setStats] = useState(initialStats);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<any>(empty);
  const [editing, setEditing] = useState<Item | null>(null);
  const [modal, setModal] = useState<
    "form" | "purchase" | "ship" | "return" | "reject" | "logs" | "tracking" | null
  >(null);
  const [active, setActive] = useState<Item | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [tracking, setTracking] = useState<any>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("submission_date");
  const [ascending, setAscending] = useState(false);
  const [anchors, setAnchors] = useState<
    { id: string; realName: string; nickname: string; room: string }[]
  >([]);
  const [anchorOpen, setAnchorOpen] = useState(false);
  const [anchorSearch, setAnchorSearch] = useState("");
  const [anchorLoading, setAnchorLoading] = useState(false);
  useEffect(() => {
    if (modal !== "form") {
      setAnchorOpen(false);
      setAnchorSearch("");
      return;
    }
    let cancelled = false;
    setAnchorLoading(true);
    fetch("/api/procurement/anchors")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error?.message || "加载主播列表失败");
        if (!cancelled) setAnchors(data.anchors || []);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setAnchorLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modal]);
  const formControl =
    "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
  const formLabel = "block text-xs font-bold text-slate-700";
  const upload = async (files: File[]) => {
    setUploading(true);
    setError("");
    try {
      const urls: string[] = [];
      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        const fd = new FormData();
        fd.append("file", file);
        const r = await fetch("/api/procurement/upload", { method: "POST", body: fd });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error?.message || "上传失败");
        urls.push(d.url);
      }
      setForm((f: any) => ({ ...f, screenshots: [...f.screenshots, ...urls] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };
  useEffect(() => {
    if (modal !== "form") return;
    const paste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length) {
        e.preventDefault();
        void upload(files);
      }
    };
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  }, [modal]);
  const queryTracking = async (i: Item) => {
    setActive(i);
    setModal("tracking");
    setTracking(null);
    setTrackingLoading(true);
    setError("");
    try {
      const r = await fetch("/api/procurement/tracking", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tracking_no: i.tracking_no }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || "查询失败");
      setTracking(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "查询失败");
    } finally {
      setTrackingLoading(false);
    }
  };
  const refresh = async () => {
    const r = await fetch("/api/procurement");
    const d = await r.json();
    setItems(d.items ?? []);
    setStats(d.stats ?? {});
  };
  const mutate = async (url: string, method: string, body?: unknown) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "操作失败");
      setModal(null);
      await refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!form.item_name.trim()) {
      setError("请填写物品名称");
      return;
    }
    if (!form.anchor_name.trim() || (!editing && !form.anchor_binding_id)) {
      setError("请选择使用主播");
      return;
    }
    if (
      await mutate(
        editing ? `/api/procurement/${editing.id}` : "/api/procurement",
        editing ? "PUT" : "POST",
        form,
      )
    ) {
      setEditing(null);
      setForm(empty);
    }
  };
  const action = async (actionName: string, extra: any = {}, target?: Item) => {
    const item = target || active;
    if (!item) return;
    await mutate(`/api/procurement/${item.id}`, "PATCH", { action: actionName, ...extra });
  };
  const remove = async (i: Item) => {
    if (confirm(`确认删除「${i.item_name}」？`)) await mutate(`/api/procurement/${i.id}`, "DELETE");
  };
  const shown = useMemo(
    () =>
      items.filter(
        (i) =>
          (filter === "all" || i.status === filter) &&
          (!search ||
            [i.item_name, i.requester, i.anchor_name, i.room]
              .join(" ")
              .toLowerCase()
              .includes(search.toLowerCase())),
      ),
    [items, filter, search],
  );
  const sorted = [...shown].sort((a, b) => {
    const numeric = ["price", "actual_price"].includes(sort);
    const av = numeric ? Number(a[sort] || 0) : String(a[sort] || "");
    const bv = numeric ? Number(b[sort] || 0) : String(b[sort] || "");
    return (av < bv ? -1 : av > bv ? 1 : 0) * (ascending ? 1 : -1);
  });
  const paginated = sorted.slice((page - 1) * 20, page * 20);
  useEffect(() => setPage(1), [filter, search, sort]);
  const stat = (k: string) => stats[k]?.count ?? stats[k] ?? 0;
  return (
    <main className="space-y-5 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">道具采购</h1>
          <p className="mt-1 text-sm text-slate-500">采购需求与订单跟进</p>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded border px-3 py-2 text-sm"
            onClick={() => {
              const csv = [
                "物品名称,数量,预计价格,状态,申请人,主播,直播间,平台,用途,备注",
                ...shown.map((i) =>
                  [
                    i.item_name,
                    i.quantity,
                    i.price,
                    statuses[i.status],
                    i.requester,
                    i.anchor_name,
                    i.room,
                    i.platform,
                    i.usage,
                    i.remarks,
                  ]
                    .map((x: any) => `"${String(x ?? "").replaceAll('"', '""')}"`)
                    .join(","),
                ),
              ].join("\n");
              const a = document.createElement("a");
              a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" }));
              a.download = `道具采购_${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
            }}
          >
            导出
          </button>
          <button
            className="rounded bg-slate-900 px-3 py-2 text-sm text-white"
            onClick={() => {
              setEditing(null);
              setForm({ ...empty, requester: currentUserName });
              setModal("form");
            }}
          >
            新增需求
          </button>
        </div>
      </header>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["pending", "待采购"],
          ["shipped", "运输中"],
          ["total", "总单数"],
        ].map(([k, v]) => (
          <button
            key={k}
            onClick={() => setFilter(k === "total" ? "all" : (k ?? "all"))}
            className="rounded-xl border bg-white p-4 text-left"
          >
            <div className="text-xs text-slate-500">{v}</div>
            <div className="mt-1 text-xl font-semibold">{stat(k ?? "all")}</div>
          </button>
        ))}
        <div className="rounded-xl border bg-white p-3">
          <div className="text-xs text-slate-500">总支出</div>
          <div className="mt-1 text-xl font-semibold">
            ¥{Number(stats.totalSpend ?? 0).toFixed(2)}
          </div>
        </div>
      </div>
      <section className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border bg-white p-1">
          {[["all", "全部"], ...Object.entries(statuses)].map(([k, v]) => (
            <button
              key={k}
              onClick={() => setFilter(k ?? "all")}
              className={`rounded px-3 py-1.5 text-xs ${filter === k ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="rounded border px-3 py-2"
            placeholder="搜索物品/申请人/主播/直播间"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="rounded border px-3 py-2" onClick={refresh}>
            查询
          </button>
          <button
            className="rounded border px-3 py-2"
            onClick={() => {
              setFilter("all");
              setSearch("");
              refresh();
            }}
          >
            重置
          </button>
        </div>
      </section>
      {error && !modal && (
        <p
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1200px] table-fixed text-left text-xs">
          <colgroup>
            {[90, 80, 200, 135, 100, 150, 190, 130, 210].map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead className="bg-slate-50/80 text-slate-500">
            <tr>
              {[
                ["submission_date", "申请时间"],
                ["", "图片"],
                ["item_name", "物品信息"],
                ["platform", "平台/订单"],
                ["requester", "申请人"],
                ["anchor_name", "主播/直播间"],
                ["status", "状态"],
                ["price", "金额"],
                ["", "操作"],
              ].map(([k, l]) => (
                <th key={l} className="px-3 py-3 font-medium">
                  <button
                    disabled={!k}
                    onClick={() => {
                      setSort(k ?? "all");
                      setAscending(sort === k ? !ascending : false);
                    }}
                  >
                    {l}
                    {k && (
                      <span className="ml-1 text-slate-300">
                        {sort === k ? (ascending ? "↑" : "↓") : "↕"}
                      </span>
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map((i) => {
              const images = parseImages(i.screenshot);
              const estimate = Number(i.price || 0) * Number(i.quantity || 1);
              const difference = Number(i.actual_price || 0) - estimate;
              return (
                <tr className="border-t border-slate-100 hover:bg-slate-50/50" key={i.id}>
                  <td className="px-3 py-4 text-slate-400">
                    {i.submission_date || String(i.created_at).slice(0, 10)}
                  </td>
                  <td className="px-3 py-4">
                    {images.length ? (
                      <button className="relative" onClick={() => setPreview(images[0] ?? "")}>
                        <img
                          src={imageUrl(images[0] ?? "")}
                          alt={`${i.item_name}商品截图`}
                          className="h-12 w-12 rounded-lg border border-slate-200 object-cover"
                        />
                        {images.length > 1 && (
                          <span className="absolute bottom-0 right-0 rounded bg-slate-900/70 px-1 text-[10px] text-white">
                            {images.length}
                          </span>
                        )}
                      </button>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-4">
                    <div className="font-semibold text-slate-700">
                      {i.link ? (
                        <a
                          href={String(i.link).match(/https?:\/\/[^\s]+/)?.[0] || "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-blue-600 hover:underline"
                          aria-label={`打开${i.item_name}采购链接`}
                        >
                          {i.item_name}
                        </a>
                      ) : (
                        i.item_name
                      )}
                    </div>
                    <span className="mt-1 inline-block rounded border border-slate-100 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">
                      ♧ {i.usage || "未填用途"}
                    </span>
                    {i.quantity > 1 && <span className="ml-2 text-slate-400">× {i.quantity}</span>}
                  </td>
                  <td className="px-3 py-4 text-slate-600">
                    {i.platform || "—"}
                    {i.order_id && (
                      <div className="mt-1 text-[10px] text-slate-400">
                        单号:{" "}
                        <span title={i.order_id} className="text-blue-500">
                          {String(i.order_id).slice(0, 10)}…
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-4 text-slate-600">
                    ♙ {i.requester || i.submitter || "—"}
                  </td>
                  <td className="px-3 py-4">
                    <div className="font-medium text-blue-500">{i.anchor_name || "—"}</div>
                    <div className="mt-1 text-slate-400">♧ {i.room || "未填"}</div>
                  </td>
                  <td className="px-3 py-4">
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-medium ${statusColor(i.status)}`}
                    >
                      {statuses[i.status] || i.status}
                    </span>
                    {i.tracking_no && (
                      <div className="mt-2 flex items-center gap-2">
                        <span
                          title={i.tracking_no}
                          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-400"
                        >
                          {String(i.tracking_no).slice(0, 10)}…
                        </span>
                        <button
                          className="whitespace-nowrap font-medium text-slate-600"
                          onClick={() => queryTracking(i)}
                        >
                          查物流
                        </button>
                      </div>
                    )}
                    {i.approval_remark && (
                      <div className="mt-2 text-[10px] text-red-500">{i.approval_remark}</div>
                    )}
                  </td>
                  <td className="px-3 py-4">
                    <div className="text-slate-400">
                      预估: <span className="text-slate-600">¥{estimate.toFixed(2)}</span>
                    </div>
                    {i.actual_price != null && (
                      <>
                        <div className="mt-1 text-slate-400">
                          实际:{" "}
                          <span className="text-green-600">
                            ¥{Number(i.actual_price).toFixed(2)}
                          </span>
                        </div>
                        <div className="mt-1 text-[10px] text-slate-400">
                          差额:{" "}
                          <span className={difference > 0 ? "text-red-500" : "text-green-500"}>
                            {difference > 0 ? "+" : ""}
                            {difference.toFixed(2)}
                          </span>
                        </div>
                      </>
                    )}
                    {Number(i.refund_amount) > 0 && (
                      <div className="mt-1 text-[10px] text-red-500">
                        退款: ¥{Number(i.refund_amount).toFixed(2)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {i.status === "pending_approval" && (
                        <>
                          <button
                            className="text-green-600"
                            onClick={() => action("approve", {}, i)}
                          >
                            通过
                          </button>
                          <button
                            className="text-red-500"
                            onClick={() => {
                              setActive(i);
                              setModal("reject");
                            }}
                          >
                            拒绝
                          </button>
                        </>
                      )}
                      {["pending", "purchased", "shipped", "received"].includes(i.status) && (
                        <button
                          onClick={() => {
                            setActive(i);
                            setModal("purchase");
                          }}
                          className="text-slate-600"
                        >
                          订单
                        </button>
                      )}
                      {["purchased", "shipped"].includes(i.status) && (
                        <button
                          className="rounded border px-2 py-1 text-slate-600"
                          onClick={() => {
                            setActive(i);
                            setModal("ship");
                          }}
                        >
                          物流
                        </button>
                      )}
                      {i.status === "shipped" && (
                        <button
                          title="确认入库"
                          className="text-emerald-500"
                          onClick={() => {
                            if (confirm("确认物品已入库？")) action("receive", {}, i);
                          }}
                        >
                          ✓
                        </button>
                      )}
                      {["purchased", "shipped", "received"].includes(i.status) && (
                        <button
                          className="rounded bg-red-500 px-2 py-1 text-white"
                          onClick={() => {
                            setActive(i);
                            setModal("return");
                          }}
                        >
                          退货
                        </button>
                      )}
                      <button
                        title="操作日志"
                        onClick={async () => {
                          const d = await (await fetch(`/api/procurement/${i.id}`)).json();
                          setLogs(d.logs ?? []);
                          setActive(i);
                          setModal("logs");
                        }}
                        className="text-slate-400"
                      >
                        ◷
                      </button>
                      <button
                        title="编辑"
                        onClick={() => {
                          setEditing(i);
                          setForm({ ...empty, ...i, screenshots: parseImages(i.screenshot) });
                          setModal("form");
                        }}
                        className="text-blue-500"
                      >
                        ✎
                      </button>
                      <button title="删除" onClick={() => remove(i)} className="text-red-500">
                        ⌫
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex justify-between border-t px-4 py-3 text-xs text-slate-500">
          <span>共 {shown.length} 条，每页 20 条</span>
          <div className="flex gap-3">
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>
              上一页
            </button>
            <span>
              {page} / {Math.max(1, Math.ceil(shown.length / 20))}
            </span>
            <button disabled={page * 20 >= shown.length} onClick={() => setPage(page + 1)}>
              下一页
            </button>
          </div>
        </div>
      </section>
      {preview && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-8"
          onClick={() => setPreview(null)}
        >
          <button className="absolute right-6 top-6 text-2xl text-white">✕</button>
          <img
            src={imageUrl(preview)}
            alt="商品截图预览"
            className="max-h-[90vh] max-w-full object-contain"
          />
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className={`max-h-[94vh] w-full overflow-auto rounded-2xl bg-white ${modal === "form" ? "max-w-lg" : "max-w-2xl p-5"}`}
          >
            <div
              className={`flex items-center justify-between ${modal === "form" ? "border-b border-slate-100 bg-slate-50/50 px-6 py-4" : ""}`}
            >
              <h2 className="text-lg font-semibold">
                {modal === "form"
                  ? editing
                    ? "编辑采购需求"
                    : "新增采购需求"
                  : modal === "purchase"
                    ? "填写订单信息"
                    : modal === "ship"
                      ? "填写发货信息"
                      : modal === "return"
                        ? "申请退货"
                        : modal === "reject"
                          ? "拒绝采购申请"
                          : modal === "tracking"
                            ? "物流详情"
                            : "操作日志"}
              </h2>
              <button onClick={() => setModal(null)}>✕</button>
            </div>
            {error && (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {error}
              </p>
            )}
            {modal === "tracking" && (
              <div className="mt-4">
                <p className="text-sm text-slate-500">{active?.tracking_no}</p>
                {trackingLoading ? (
                  <p className="py-10 text-center text-slate-400">正在查询物流…</p>
                ) : (
                  tracking && (
                    <>
                      <div className="my-4 rounded-lg bg-blue-50 p-3 text-sm font-medium text-blue-700">
                        {tracking.stateText} · {tracking.com}
                      </div>
                      <ol className="ml-2 border-l border-slate-200">
                        {tracking.data?.map((t: any, index: number) => (
                          <li key={index} className="relative pb-5 pl-5 text-sm">
                            <span className="absolute -left-1 top-1 h-2 w-2 rounded-full bg-blue-500" />
                            <p className="text-xs text-slate-400">{t.ftime || t.time}</p>
                            <p className="mt-1 text-slate-600">{t.context}</p>
                          </li>
                        ))}
                      </ol>
                    </>
                  )
                )}
              </div>
            )}
            {modal === "form" && (
              <div className="space-y-4 px-8 py-6 text-slate-700">
                <label className={formLabel}>
                  物品名称 <span className="text-red-500">*</span>
                  <input
                    className={formControl}
                    placeholder="如：补光灯支架"
                    value={form.item_name}
                    onChange={(e) => setForm({ ...form, item_name: e.target.value })}
                  />
                </label>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    void upload(Array.from(e.dataTransfer.files));
                  }}
                >
                  <p className={formLabel}>
                    商品截图 <span className="ml-1 font-normal text-slate-400">（支持多张）</span>
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {form.screenshots.map((url: string, index: number) => (
                      <div key={index} className="relative">
                        <button onClick={() => setPreview(url)}>
                          <img
                            src={imageUrl(url)}
                            alt="已上传截图"
                            className="h-16 w-16 rounded-lg border object-cover"
                          />
                        </button>
                        <button
                          aria-label="移除截图"
                          className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1 text-xs text-white"
                          onClick={() =>
                            setForm({
                              ...form,
                              screenshots: form.screenshots.filter(
                                (_: string, i: number) => i !== index,
                              ),
                            })
                          }
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 text-slate-400">
                      <span className="text-xl">＋</span>
                      <span className="text-[10px]">{uploading ? "上传中…" : "添加图片"}</span>
                      <input
                        disabled={uploading}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          void upload(Array.from(e.target.files || []));
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    支持粘贴截图、拖拽或点击上传，每张限 5MB
                  </p>
                </div>
                <label className={formLabel}>
                  采购链接
                  <input
                    className={formControl}
                    placeholder="粘贴淘宝/拼多多链接"
                    value={form.link}
                    onChange={(e) => setForm({ ...form, link: e.target.value })}
                  />
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <label className={formLabel}>
                    预估单价
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={formControl}
                      placeholder="¥ 0"
                      value={form.price}
                      onChange={(e) => setForm({ ...form, price: e.target.value })}
                    />
                  </label>
                  <label className={formLabel}>
                    数量
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className={formControl}
                      value={form.quantity}
                      onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                    />
                  </label>
                  <label className={formLabel}>
                    平台
                    <select
                      className={formControl}
                      value={form.platform}
                      onChange={(e) => setForm({ ...form, platform: e.target.value })}
                    >
                      {platforms.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className={formLabel}>
                  申请人
                  <input
                    className={`${formControl} bg-slate-50`}
                    value={form.requester}
                    onChange={(e) => setForm({ ...form, requester: e.target.value })}
                  />
                </label>
                <div className="relative">
                  <p className={formLabel}>
                    使用主播 <span className="text-red-500">*</span>
                  </p>
                  <button
                    type="button"
                    aria-expanded={anchorOpen}
                    onClick={() => setAnchorOpen(!anchorOpen)}
                    className={`${formControl} flex items-center justify-between text-left ${form.anchor_name ? "border-blue-300 bg-blue-50 text-blue-700" : "text-slate-400"}`}
                  >
                    <span>{form.anchor_name || "点击选择主播..."}</span>
                    <span>⌄</span>
                  </button>
                  {anchorOpen && (
                    <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                      <div className="border-b p-2">
                        <input
                          autoFocus
                          aria-label="搜索主播"
                          className={formControl}
                          placeholder="搜索主播姓名或昵称..."
                          value={anchorSearch}
                          onChange={(e) => setAnchorSearch(e.target.value)}
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {anchorLoading ? (
                          <p className="p-3 text-xs text-slate-400">加载中…</p>
                        ) : (
                          anchors
                            .filter((a) =>
                              `${a.realName} ${a.nickname} ${a.room}`
                                .toLowerCase()
                                .includes(anchorSearch.toLowerCase()),
                            )
                            .map((a) => (
                              <button
                                key={a.id}
                                className="flex w-full justify-between border-b border-slate-50 px-3 py-2 text-left text-sm hover:bg-blue-50"
                                onClick={() => {
                                  setForm({
                                    ...form,
                                    anchor_name: a.realName,
                                    anchor_binding_id: a.id,
                                    room: a.room,
                                  });
                                  setAnchorOpen(false);
                                  setAnchorSearch("");
                                }}
                              >
                                <span>
                                  {a.realName || a.nickname}
                                  <span className="ml-2 text-xs text-slate-400">
                                    {a.nickname !== a.realName ? a.nickname : ""}
                                  </span>
                                </span>
                                <span className="text-xs text-slate-400">
                                  {a.room ? `直播间: ${a.room}` : "账号未配置直播间"}
                                </span>
                              </button>
                            ))
                        )}
                        {!anchorLoading &&
                          !anchors.some((a) =>
                            `${a.realName} ${a.nickname} ${a.room}`
                              .toLowerCase()
                              .includes(anchorSearch.toLowerCase()),
                          ) && <p className="p-3 text-center text-xs text-slate-400">无匹配结果</p>}
                      </div>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className={formLabel}>
                    直播间/房间号
                    <input
                      className={formControl}
                      placeholder="选择主播后自动填充"
                      value={form.room}
                      readOnly
                      aria-readonly="true"
                    />
                  </label>
                  <label className={formLabel}>
                    使用用途
                    <select
                      className={formControl}
                      value={form.usage}
                      onChange={(e) => setForm({ ...form, usage: e.target.value })}
                    >
                      {usages.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className={formLabel}>
                  发票要求
                  <select
                    className={formControl}
                    value={form.invoice}
                    onChange={(e) => setForm({ ...form, invoice: e.target.value })}
                  >
                    <option value="可开票">需要开票</option>
                    <option value="不可开票">不需要开票</option>
                  </select>
                </label>
                <label className={formLabel}>
                  备注
                  <textarea
                    className={`${formControl} resize-none`}
                    rows={2}
                    placeholder="填写其他特殊要求..."
                    value={form.remarks}
                    onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                  />
                </label>
                <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
                  <button
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                    disabled={busy}
                    onClick={() => setModal(null)}
                  >
                    取消
                  </button>
                  <button
                    className="rounded-lg bg-blue-500 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                    disabled={busy || uploading}
                    onClick={save}
                  >
                    {busy ? "提交中…" : editing ? "保存修改" : "提交需求"}
                  </button>
                </div>
              </div>
            )}
            {modal === "purchase" && (
              <ActionForm
                key={`purchase-${active?.id}`}
                initialValues={active ?? {}}
                fields={[
                  ["order_id", "订单号"],
                  ["shop_name", "采购店铺"],
                  ["actual_price", "实际采购金额"],
                ]}
                onSubmit={(v: any) => action("purchase", v)}
                busy={busy}
              />
            )}{" "}
            {modal === "ship" && (
              <ActionForm
                key={`ship-${active?.id}`}
                initialValues={active ?? {}}
                fields={[["tracking_no", "快递单号"]]}
                onSubmit={(v: any) => action("ship", v)}
                busy={busy}
              />
            )}{" "}
            {modal === "return" && (
              <ActionForm
                key={`return-${active?.id}`}
                initialValues={{
                  reason: active?.return_reason ?? "",
                  refund_amount:
                    active?.status === "returned"
                      ? active.refund_amount
                      : (active?.actual_price ??
                        Number(active?.price ?? 0) * Number(active?.quantity ?? 1)),
                }}
                fields={[
                  ["reason", "退货原因"],
                  ["refund_amount", "退款金额"],
                ]}
                onSubmit={(v: any) => action("return", v)}
                busy={busy}
              />
            )}{" "}
            {modal === "reject" && (
              <ActionForm
                fields={[["remark", "拒绝理由"]]}
                onSubmit={(v: any) => action("reject", v)}
                busy={busy}
              />
            )}{" "}
            {modal === "logs" && (
              <div className="mt-4 space-y-2">
                {logs.map((l) => (
                  <div className="border-b py-2 text-sm" key={l.id}>
                    <b>{l.action}</b> ·{" "}
                    {l.from_status
                      ? `${statuses[l.from_status as string]} → ${statuses[l.to_status as string] || l.to_status}`
                      : ""}
                    <div className="text-xs text-slate-500">
                      {l.remark || ""} · {String(l.created_at).replace("T", " ").slice(0, 19)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
function ActionForm({
  fields,
  initialValues = {},
  onSubmit,
  busy,
}: {
  fields: string[][];
  initialValues?: Record<string, unknown>;
  onSubmit: (v: any) => void;
  busy: boolean;
}) {
  const [v, setV] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map(([key]) => [key, String(initialValues[key as string] ?? "")])),
  );
  return (
    <div className="mt-4 space-y-3">
      {fields.map(([k, l]) => (
        <label className="block text-sm" key={k as string}>
          {l}
          <input
            className="mt-1 w-full rounded border px-3 py-2"
            value={v[k as string] ?? ""}
            onChange={(e) => setV({ ...v, [k as string]: e.target.value })}
          />
        </label>
      ))}
      <div className="flex justify-end">
        <button
          className="rounded bg-slate-900 px-4 py-2 text-white"
          disabled={busy}
          onClick={() => onSubmit(v)}
        >
          确认
        </button>
      </div>
    </div>
  );
}

function parseImages(raw: unknown): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (Array.isArray(parsed)) return parsed.filter((v: unknown) => typeof v === "string");
  } catch {
    /* Legacy single image values are not JSON. */
  }
  return [String(raw)];
}
function imageUrl(url: string) {
  return url.startsWith("/uploads/procurement/")
    ? `/api/procurement/media?path=${encodeURIComponent(url)}`
    : url;
}
function statusColor(status: string) {
  return (
    (
      {
        pending_approval: "bg-orange-100 text-orange-700",
        pending: "bg-yellow-100 text-yellow-700",
        purchased: "bg-blue-100 text-blue-700",
        shipped: "bg-purple-100 text-purple-700",
        received: "bg-green-100 text-green-700",
        returned: "bg-red-100 text-red-700",
        rejected: "bg-slate-100 text-slate-600",
      } as Record<string, string>
    )[status] || "bg-slate-100"
  );
}
