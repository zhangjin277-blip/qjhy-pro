import { z } from "zod";

export const Platform = z.enum(["抖音", "快手", "B站", "视频号"]);
export type Platform = z.infer<typeof Platform>;

export const Product = z.enum([
  "捕鱼大作战",
  "三国冰河时代",
  "途游斗地主",
  "富豪麻将",
  "途游休闲捕鱼",
  "电玩捕鱼",
  "造化仙府",
  "试播",
  "招募",
]);
export type Product = z.infer<typeof Product>;

export const LiveStatus = z.enum(["living", "offline", "banned", "unknown"]);
export type LiveStatus = z.infer<typeof LiveStatus>;

// platform-product 联动表（spec §5.2）
const PRODUCT_PLATFORMS: Record<z.infer<typeof Product>, z.infer<typeof Platform>[]> = {
  途游斗地主: ["抖音"],
  富豪麻将: ["抖音"],
  三国冰河时代: ["抖音"],
  捕鱼大作战: ["快手"],
  途游休闲捕鱼: ["快手"],
  电玩捕鱼: ["快手"],
  // 新产品先不限平台，跑通后再收紧
  造化仙府: ["抖音", "快手", "B站", "视频号"],
  // 试播/招募是过程性分类（还没定产品），不限平台
  试播: ["抖音", "快手", "B站", "视频号"],
  招募: ["抖音", "快手", "B站", "视频号"],
};

export const UpsertAccountInput = z
  .object({
    id: z.string().optional(),
    account_name: z.string().min(1),
    platform: Platform,
    platform_account_id: z.string().optional().nullable(),
    platform_uid: z.string().optional().nullable(),
    platform_real_name: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    phone_index: z.string().optional().nullable(),
    phone_real_name: z.string().optional().nullable(),
    room_id: z.string().optional().nullable(),
    game_account_1: z.string().optional().nullable(),
    game_account_2: z.string().optional().nullable(),
    game_account_3: z.string().optional().nullable(),
    product: Product,
    agent_dingtalk_user_id: z.string().optional().nullable(),
    placement_label: z.string().optional().nullable(),
    live_status: LiveStatus.default("unknown"),
  })
  .refine((d) => PRODUCT_PLATFORMS[d.product].includes(d.platform), {
    message: "产品与平台不匹配（如 '捕鱼大作战' 仅支持快手）",
    path: ["product"],
  });
export type UpsertAccountInput = z.infer<typeof UpsertAccountInput>;

export const DeleteAccountInput = z.object({
  id: z.string().min(1),
  /** 强制删除：连同关联的 placement_row 一起删；admin 显式确认才传 */
  force: z.boolean().optional(),
});

export const ListAccountsInput = z.object({
  platform: Platform.optional(),
  product: Product.optional(),
});

// ─── 删除审核流 ──────────────────────────────────────────────────────────────

export const DeleteContextInput = z.object({ id: z.string().min(1) });

export const DeleteRequestCreateInput = z.object({
  id: z.string().min(1), // account id
  reason: z.string().max(500).optional().nullable(),
});

export const DeleteRequestReviewInput = z.object({
  requestId: z.string().min(1),
  approve: z.boolean(),
  note: z.string().max(500).optional().nullable(),
});

export const DeleteRequestCancelInput = z.object({ requestId: z.string().min(1) });
