import { date, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { dingtalk_user } from "./dingtalk";

/**
 * 快手公会平台「成员管理」全量数据。
 * 这是「主播基础信息」的源头，独立于 live_account（运营账号）。
 *
 * 与 live_account 的边界：
 *   - kuaishou_member：公会后台原始账号清单（≈ 78 行），主播明细页直接展示
 *   - live_account：QJHY 自己运营的账号（PRO3 迁移 + 手工建），需要登记排班/绑投放
 *   - 两者通过快手 ID（user_id ↔ live_account.platform_account_id）关联
 *     由「stub → kuaishou_member 匹配」脚本来填充 stub 的 avatar / platform_account_id
 */
export const kuaishou_member = pgTable(
  "kuaishou_member",
  {
    user_id: text("user_id").primaryKey(), // 快手数字 ID（公会 API memberId/userId）
    member_name: text("member_name").notNull(), // 昵称
    avatar: text("avatar"), // 平台头像 CDN URL
    fans_count: integer("fans_count"), // 精确粉丝数（直存 number 便于排序）

    broker_name_raw: text("broker_name_raw"), // 公会经纪人原始姓名
    agent_dingtalk_user_id: text("agent_dingtalk_user_id").references(() => dingtalk_user.user_id), // 反查到的钉钉用户

    inferred_product: text("inferred_product"), // 按昵称正则推断的产品（捕鱼大作战 / 途游休闲捕鱼 / 电玩捕鱼 / null）
    content_category: text("content_category"), // 公会侧内容分类（游戏/财经/颜值…）

    joined_at: date("joined_at"),
    contract_expire_at: date("contract_expire_at"),
    renewal_status: text("renewal_status"), // "已开启自动续约" / "可发起续约" / ...
    contract_renew_type: integer("contract_renew_type"),

    last_live_time: timestamp("last_live_time"),
    last_photo_time: timestamp("last_photo_time"),
    living_url: text("living_url"), // 当前直播间链接（直播中才有）

    raw: jsonb("raw").notNull().default({}), // 完整原始 API 字段
    synced_at: timestamp("synced_at").notNull().defaultNow(),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    idx_broker: index("idx_kuaishou_member_broker").on(t.broker_name_raw),
    idx_agent: index("idx_kuaishou_member_agent").on(t.agent_dingtalk_user_id),
    idx_product: index("idx_kuaishou_member_product").on(t.inferred_product),
    idx_last_live: index("idx_kuaishou_member_last_live").on(t.last_live_time),
  }),
);
