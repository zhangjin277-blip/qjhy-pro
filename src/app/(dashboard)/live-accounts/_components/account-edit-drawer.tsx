"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { upsertAccount, deleteAccount } from "@/modules/live-account";
import type { AccountWithRelations } from "@/modules/live-account";
import { AnchorBindingForm } from "./anchor-binding-form";
import { ScheduleOverrideTab } from "./schedule-override-tab";
import type { OverrideRowView } from "./schedule-override-tab";

/**
 * 简易可搜索 select（避免引入 cmdk 依赖）。
 * 显示「name · title」，支持中文/拼音/职位模糊过滤（前缀 + 包含）。
 */
function SearchableUserSelect({
  value,
  onChange,
  options,
  placeholder = "搜索运营姓名…",
  emptyHint = "无匹配运营",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { user_id: string; name: string; title: string | null }[];
  placeholder?: string;
  emptyHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.user_id === value);
  const display = selected ? selected.name : "";

  const filtered = query.trim()
    ? options.filter((o) => {
        const q = query.toLowerCase();
        return o.name.toLowerCase().includes(q) || (o.title?.toLowerCase().includes(q) ?? false);
      })
    : options;

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded border border-slate-200 bg-white px-3 py-2 text-left text-[13px] text-slate-800 hover:border-slate-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
      >
        <span className={display ? "" : "text-slate-300"}>{display || "— 不指定 —"}</span>
        <span className="text-slate-400">▾</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-t-md border-b border-slate-200 px-3 py-2 text-[13px] outline-none"
          />
          <div className="max-h-60 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
                setQuery("");
              }}
              className="w-full px-3 py-1.5 text-left text-[12px] text-slate-400 hover:bg-slate-50"
            >
              — 不指定 —
            </button>
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-slate-400">{emptyHint}</div>
            ) : (
              filtered.map((u) => (
                <button
                  type="button"
                  key={u.user_id}
                  onClick={() => {
                    onChange(u.user_id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] hover:bg-slate-50 ${
                    u.user_id === value ? "bg-blue-50 text-blue-700" : "text-slate-700"
                  }`}
                >
                  <span className="font-medium">{u.name}</span>
                  {u.title && <span className="text-[11px] text-slate-400">{u.title}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 投放标签下拉：搜索 + 从已有标签选 + 允许新增（输入新值后回车提交）。
 * 用 datalist 风格的 popover：上面输入框，下面 filtered 列表，回车/点击都能选。
 */
function SearchablePlacementLabelSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? options.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase()))
    : options;
  const queryIsNewLabel =
    query.trim().length > 0 && !options.some((o) => o.toLowerCase() === query.trim().toLowerCase());

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded border border-slate-200 bg-white px-3 py-2 text-left text-[13px] text-slate-800 hover:border-slate-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
      >
        <span className={value ? "" : "text-slate-300"}>{value || "— 选择或输入新标签 —"}</span>
        <span className="text-slate-400">▾</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) {
                onChange(query.trim());
                setOpen(false);
                setQuery("");
              }
            }}
            placeholder="搜索或输入新标签后回车…"
            className="w-full rounded-t-md border-b border-slate-200 px-3 py-2 text-[13px] outline-none"
          />
          <div className="max-h-60 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
                setQuery("");
              }}
              className="w-full px-3 py-1.5 text-left text-[12px] text-slate-400 hover:bg-slate-50"
            >
              — 不指定 —
            </button>
            {queryIsNewLabel && (
              <button
                type="button"
                onClick={() => {
                  onChange(query.trim());
                  setOpen(false);
                  setQuery("");
                }}
                className="w-full px-3 py-1.5 text-left text-[13px] text-blue-600 hover:bg-blue-50"
              >
                + 新增标签「{query.trim()}」
              </button>
            )}
            {filtered.length === 0 && !queryIsNewLabel ? (
              <div className="px-3 py-2 text-[12px] text-slate-400">无匹配标签</div>
            ) : (
              filtered.map((label) => (
                <button
                  type="button"
                  key={label}
                  onClick={() => {
                    onChange(label);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] hover:bg-slate-50 ${
                    label === value ? "bg-blue-50 text-blue-700" : "text-slate-700"
                  }`}
                >
                  <span className="font-medium">{label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const PRODUCT_PLATFORMS: Record<string, string[]> = {
  途游斗地主: ["抖音"],
  富豪麻将: ["抖音"],
  三国冰河时代: ["抖音"],
  捕鱼大作战: ["快手"],
  途游休闲捕鱼: ["快手"],
  电玩捕鱼: ["快手"],
};

const ALL_PRODUCTS = [
  "捕鱼大作战",
  "三国冰河时代",
  "途游斗地主",
  "富豪麻将",
  "途游休闲捕鱼",
  "电玩捕鱼",
];

const ALL_PLATFORMS = ["抖音", "快手", "B站", "视频号"];
const LIVE_STATUSES = [
  { value: "living", label: "直播中" },
  { value: "offline", label: "未开播" },
  { value: "banned", label: "封禁" },
  { value: "unknown", label: "未知" },
];

interface RoomLite {
  id: string;
  room_no: string;
}

interface DingtalkUserLite {
  user_id: string;
  name: string;
  title: string | null;
  active: boolean;
}

interface AnchorLite {
  dingtalk_user_id: string;
  name: string;
}

interface BindingLite {
  id: string;
  account_id: string | null;
  dingtalk_user_id: string;
  anchor_name: string | null;
  time_slots: [string, string][];
  rest_days: number[];
  remark: string | null;
}

interface AccountEditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: AccountWithRelations | null;
  rooms: RoomLite[];
  dingtalkUsers: DingtalkUserLite[];
  anchors: AnchorLite[];
  defaultProduct?: string;
  bindingsByAccount: Record<string, BindingLite[]>;
  overridesByAccount: Record<string, OverrideRowView[]>;
  /** 已有 placement_label 列表（去重，从所有 live_account 收集），供下拉选 */
  placementLabelOptions: string[];
}

type TabKey = "basic" | "bindings";
type ScheduleSubTab = "default" | "override";

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 placeholder:text-slate-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";
const selectCls =
  "w-full rounded border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";

export function AccountEditDrawer({
  open,
  onOpenChange,
  account,
  rooms,
  dingtalkUsers,
  anchors,
  defaultProduct = "捕鱼大作战",
  bindingsByAccount,
  overridesByAccount,
  placementLabelOptions,
}: AccountEditDrawerProps) {
  const isEdit = account !== null;
  const [tab, setTab] = useState<TabKey>("basic");
  const [scheduleSubTab, setScheduleSubTab] = useState<ScheduleSubTab>("default");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [accountName, setAccountName] = useState("");
  const [product, setProduct] = useState(defaultProduct);
  const [platform, setPlatform] = useState("");
  const [platformAccountId, setPlatformAccountId] = useState("");
  const [platformUid, setPlatformUid] = useState("");
  const [platformRealName, setPlatformRealName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneIndex, setPhoneIndex] = useState("");
  const [phoneRealName, setPhoneRealName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [gameAccount1, setGameAccount1] = useState("");
  const [gameAccount2, setGameAccount2] = useState("");
  const [gameAccount3, setGameAccount3] = useState("");
  const [agentDingtalkUserId, setAgentDingtalkUserId] = useState("");
  const [placementLabel, setPlacementLabel] = useState("");
  const [liveStatus, setLiveStatus] = useState("unknown");

  // Derived: allowed platforms for selected product
  const allowedPlatforms = PRODUCT_PLATFORMS[product] ?? ALL_PLATFORMS;

  // Populate form from account
  useEffect(() => {
    if (!open) return;
    if (account) {
      setAccountName(account.account_name);
      setProduct(account.product);
      setPlatform(account.platform);
      setPlatformAccountId(account.platform_account_id ?? "");
      setPlatformUid(account.platform_uid ?? "");
      setPlatformRealName(account.platform_real_name ?? "");
      setPhone(account.phone ?? "");
      setPhoneIndex(account.phone_index ?? "");
      setPhoneRealName(account.phone_real_name ?? "");
      setRoomId(account.room_id ?? "");
      setGameAccount1(account.game_account_1 ?? "");
      setGameAccount2(account.game_account_2 ?? "");
      setGameAccount3(account.game_account_3 ?? "");
      setAgentDingtalkUserId(account.agent_dingtalk_user_id ?? "");
      setPlacementLabel(account.placement_label ?? "");
      setLiveStatus(account.live_status ?? "unknown");
    } else {
      setAccountName("");
      setProduct(defaultProduct);
      const firstPlatform = PRODUCT_PLATFORMS[defaultProduct]?.[0] ?? "抖音";
      setPlatform(firstPlatform);
      setPlatformAccountId("");
      setPlatformUid("");
      setPlatformRealName("");
      setPhone("");
      setPhoneIndex("");
      setPhoneRealName("");
      setRoomId("");
      setGameAccount1("");
      setGameAccount2("");
      setGameAccount3("");
      setAgentDingtalkUserId("");
      setPlacementLabel("");
      setLiveStatus("unknown");
    }
    setTab("basic");
    setScheduleSubTab("default");
    setError(null);
  }, [open, account, defaultProduct]);

  // Auto-update platform when product changes
  const handleProductChange = (p: string) => {
    setProduct(p);
    const allowed = PRODUCT_PLATFORMS[p] ?? ALL_PLATFORMS;
    if (!allowed.includes(platform)) {
      setPlatform(allowed[0] ?? "抖音");
    }
  };

  const handleDelete = () => {
    if (!account) return;
    if (
      !confirm(
        `确认删除账号「${account.account_name}」？\n该操作不可撤销，关联的排班/绑定也会一并清理。`,
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteAccount({ id: account.id });
        onOpenChange(false);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "删除失败，请重试";
        setError(msg);
      }
    });
  };

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      try {
        await upsertAccount({
          id: account?.id,
          account_name: accountName,
          product,
          platform,
          platform_account_id: platformAccountId || null,
          platform_uid: platformUid || null,
          platform_real_name: platformRealName || null,
          phone: phone || null,
          phone_index: phoneIndex || null,
          phone_real_name: phoneRealName || null,
          room_id: roomId || null,
          game_account_1: gameAccount1 || null,
          game_account_2: gameAccount2 || null,
          game_account_3: gameAccount3 || null,
          agent_dingtalk_user_id: agentDingtalkUserId || null,
          placement_label: placementLabel || null,
          live_status: liveStatus as "living" | "offline" | "banned" | "unknown",
        });
        onOpenChange(false);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "保存失败，请重试";
        setError(msg);
      }
    });
  };

  const currentBindings = account ? (bindingsByAccount[account.id] ?? []) : [];

  const activeUsers = dingtalkUsers.filter((u) => u.active);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[560px] !max-w-[90vw] gap-0 p-0 sm:max-w-none">
        <SheetTitle className="sr-only">
          {isEdit ? `编辑账号 · ${account?.account_name}` : "新增账号"}
        </SheetTitle>
        <SheetDescription className="sr-only">
          {isEdit ? "编辑直播账号信息及轮播排班" : "新增直播账号"}
        </SheetDescription>

        <div className="flex h-full flex-col overflow-hidden">
          {/* Header */}
          <div className="border-b border-slate-200 px-6 pt-5 pb-0">
            <div className="mb-3 text-xs text-slate-500">
              {isEdit ? `编辑账号 · ${account?.account_name}` : "新增账号"}
            </div>

            {/* Tabs */}
            <div className="flex gap-0">
              {(
                [
                  { key: "basic", label: "基本信息" },
                  { key: "bindings", label: "主播 / 排班" },
                ] as { key: TabKey; label: string }[]
              ).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`border-b-2 px-4 pb-3 text-[13px] font-medium transition-colors ${
                    tab === t.key
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {t.label}
                  {t.key === "bindings" && (
                    <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0 text-[10px] text-slate-600">
                      {currentBindings.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {tab === "bindings" && (
              <div className="mb-4 flex gap-0 border-b border-slate-200 -mx-6 px-6">
                {(
                  [
                    { key: "default", label: "默认排班" },
                    { key: "override", label: "临时调整" },
                  ] as { key: ScheduleSubTab; label: string }[]
                ).map((st) => (
                  <button
                    key={st.key}
                    onClick={() => setScheduleSubTab(st.key)}
                    className={`border-b-2 px-3 pb-2 text-[12px] font-medium transition-colors ${
                      scheduleSubTab === st.key
                        ? "border-blue-500 text-blue-600"
                        : "border-transparent text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            )}
            {tab === "basic" ? (
              <div className="flex flex-col gap-4">
                {error && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
                    {error}
                  </div>
                )}

                <FormField label="账号名称 *">
                  <input
                    className={inputCls}
                    placeholder="如：小美-捕鱼大作战"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                  />
                </FormField>

                <div className="grid grid-cols-2 gap-4">
                  <FormField label="产品">
                    <select
                      className={selectCls}
                      value={product}
                      onChange={(e) => handleProductChange(e.target.value)}
                    >
                      {ALL_PRODUCTS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <FormField label="平台">
                    <select
                      className={selectCls}
                      value={platform}
                      onChange={(e) => setPlatform(e.target.value)}
                    >
                      {allowedPlatforms.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField label="平台账号 ID">
                    <input
                      className={inputCls}
                      placeholder="平台账号 ID"
                      value={platformAccountId}
                      onChange={(e) => setPlatformAccountId(e.target.value)}
                    />
                  </FormField>
                  <FormField label="平台 UID">
                    <input
                      className={inputCls}
                      placeholder="UID"
                      value={platformUid}
                      onChange={(e) => setPlatformUid(e.target.value)}
                    />
                  </FormField>
                </div>

                <FormField label="平台账号实名">
                  <input
                    className={inputCls}
                    placeholder="平台账号开户人姓名"
                    value={platformRealName}
                    onChange={(e) => setPlatformRealName(e.target.value)}
                  />
                  <span className="text-[10.5px] text-slate-400">
                    抖音/快手账号本身的开户实名，不一定是当前播主
                  </span>
                </FormField>

                <div className="grid grid-cols-2 gap-4">
                  <FormField label="手机号">
                    <input
                      className={inputCls}
                      placeholder="手机号"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </FormField>
                  <FormField label="手机编号">
                    <input
                      className={inputCls}
                      placeholder="如：SJ-240719-001"
                      value={phoneIndex}
                      onChange={(e) => setPhoneIndex(e.target.value)}
                    />
                  </FormField>
                </div>

                <FormField label="手机实名">
                  <input
                    className={inputCls}
                    placeholder="手机实名"
                    value={phoneRealName}
                    onChange={(e) => setPhoneRealName(e.target.value)}
                  />
                </FormField>

                <FormField label="直播间">
                  <select
                    className={selectCls}
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                  >
                    <option value="">— 不绑定 —</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.room_no}
                      </option>
                    ))}
                  </select>
                </FormField>

                <div className="grid grid-cols-3 gap-3">
                  <FormField label="游戏账号 1">
                    <input
                      className={inputCls}
                      placeholder="游戏账号 1"
                      value={gameAccount1}
                      onChange={(e) => setGameAccount1(e.target.value)}
                    />
                  </FormField>
                  <FormField label="游戏账号 2">
                    <input
                      className={inputCls}
                      placeholder="游戏账号 2"
                      value={gameAccount2}
                      onChange={(e) => setGameAccount2(e.target.value)}
                    />
                  </FormField>
                  <FormField label="游戏账号 3">
                    <input
                      className={inputCls}
                      placeholder="游戏账号 3"
                      value={gameAccount3}
                      onChange={(e) => setGameAccount3(e.target.value)}
                    />
                  </FormField>
                </div>

                <FormField label="运营（直播一部 · 在职）">
                  <SearchableUserSelect
                    value={agentDingtalkUserId}
                    onChange={setAgentDingtalkUserId}
                    options={activeUsers}
                  />
                </FormField>

                <FormField label="投放标签">
                  <SearchablePlacementLabelSelect
                    value={placementLabel}
                    onChange={setPlacementLabel}
                    options={placementLabelOptions}
                  />
                </FormField>

                <FormField label="直播状态">
                  <select
                    className={selectCls}
                    value={liveStatus}
                    onChange={(e) => setLiveStatus(e.target.value)}
                  >
                    {LIVE_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
            ) : scheduleSubTab === "default" ? (
              <AnchorBindingForm
                accountId={account?.id ?? null}
                bindings={currentBindings}
                anchors={anchors}
              />
            ) : (
              <ScheduleOverrideTab
                account_id={account?.id ?? ""}
                defaultSchedules={currentBindings.map((b) => ({
                  user: b.dingtalk_user_id,
                  slots: b.time_slots,
                  rest_days: b.rest_days,
                }))}
                candidates={anchors.map((a) => ({
                  id: a.dingtalk_user_id,
                  name: a.name,
                }))}
                initialOverrides={account ? (overridesByAccount[account.id] ?? []) : []}
              />
            )}
          </div>

          {/* Footer (only for basic tab) */}
          {tab === "basic" && (
            <div className="border-t border-slate-200 px-6 py-4 flex items-center justify-between gap-3">
              <div>
                {isEdit && (
                  <button
                    className="rounded-[5px] border border-red-200 px-4 py-2 text-[13px] text-red-600 hover:bg-red-50 disabled:opacity-60"
                    onClick={handleDelete}
                    disabled={isPending}
                  >
                    删除账号
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  className="rounded-[5px] border border-slate-200 px-4 py-2 text-[13px] text-slate-600 hover:bg-slate-50"
                  onClick={() => onOpenChange(false)}
                  disabled={isPending}
                >
                  取消
                </button>
                <button
                  className="rounded-[5px] bg-blue-500 px-4 py-2 text-[13px] font-medium text-white hover:bg-blue-600 disabled:opacity-60"
                  onClick={handleSave}
                  disabled={isPending || !accountName.trim()}
                >
                  {isPending ? "保存中…" : "保存"}
                </button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
