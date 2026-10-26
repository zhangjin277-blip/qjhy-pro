import "server-only";
import { and, eq, isNull, lte, or, gte } from "drizzle-orm";
import { db } from "@/db/client";
import { account_anchor_default, dingtalk_user, live_account, live_room } from "@/db/schema";
import { businessDate } from "@/lib/business-date";
import { AppError } from "@/lib/errors";

export async function procurementAnchorOptions() {
  const today = businessDate();
  const rows = await db
    .selectDistinct({
      accountId: live_account.id,
      userId: dingtalk_user.user_id,
      realName: dingtalk_user.name,
      nickname: live_account.account_name,
      room: live_room.room_no,
      platform: live_account.platform,
    })
    .from(account_anchor_default)
    .innerJoin(live_account, eq(account_anchor_default.account_id, live_account.id))
    .innerJoin(dingtalk_user, eq(account_anchor_default.dingtalk_user_id, dingtalk_user.user_id))
    .leftJoin(live_room, eq(live_account.room_id, live_room.id))
    .where(
      and(
        isNull(live_account.deprecated_at),
        lte(account_anchor_default.effective_from, today),
        or(
          isNull(account_anchor_default.effective_to),
          gte(account_anchor_default.effective_to, today),
        ),
      ),
    );
  return rows
    .map((row) => ({ ...row, id: `${row.accountId}:${row.userId}`, room: row.room || "" }))
    .sort(
      (a, b) =>
        a.realName.localeCompare(b.realName, "zh-CN") ||
        a.nickname.localeCompare(b.nickname, "zh-CN"),
    );
}

export async function resolveProcurementAnchor(id: unknown) {
  const option = (await procurementAnchorOptions()).find((row) => row.id === id);
  if (!option)
    throw new AppError("VALIDATION_ERROR", "请选择直播账号当前绑定的主播，绑定可能已更新", 400);
  if (!option.room)
    throw new AppError("VALIDATION_ERROR", "该直播账号尚未绑定直播间，请先在直播账号中配置", 400);
  return { anchor_name: option.realName, room: option.room };
}
