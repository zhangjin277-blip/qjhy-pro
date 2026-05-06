"use client";

import { useState, useEffect, useTransition } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { upsertAccount } from "@/modules/live-account";
import type { AccountWithRelations } from "@/modules/live-account";
import { AnchorBindingForm } from "./anchor-binding-form";

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
}

type TabKey = "basic" | "bindings";

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
}: AccountEditDrawerProps) {
  const isEdit = account !== null;
  const [tab, setTab] = useState<TabKey>("basic");
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
                  { key: "bindings", label: "轮播主播" },
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

                <FormField label="平台实名">
                  <input
                    className={inputCls}
                    placeholder="实名"
                    value={platformRealName}
                    onChange={(e) => setPlatformRealName(e.target.value)}
                  />
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

                <FormField label="运营（钉钉用户）">
                  <select
                    className={selectCls}
                    value={agentDingtalkUserId}
                    onChange={(e) => setAgentDingtalkUserId(e.target.value)}
                  >
                    <option value="">— 不指定 —</option>
                    {activeUsers.map((u) => (
                      <option key={u.user_id} value={u.user_id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="投放标签">
                  <input
                    className={inputCls}
                    placeholder="如：福利官"
                    value={placementLabel}
                    onChange={(e) => setPlacementLabel(e.target.value)}
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
            ) : (
              <AnchorBindingForm
                accountId={account?.id ?? null}
                bindings={currentBindings}
                anchors={anchors}
              />
            )}
          </div>

          {/* Footer (only for basic tab) */}
          {tab === "basic" && (
            <div className="border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3">
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
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
