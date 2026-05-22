import "server-only";

import { db } from "@/db/client";
import {
  auth_invite_code,
  auth_invite_code_use,
  auth_permission_override,
  dingtalk_user,
  auth_user,
} from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { randomBytes, randomUUID } from "node:crypto";
import type { InviteCodePermSpec, InviteCodeRow, InviteCodeUseRow } from "./types";

/**
 * 邀请码短码生成：6 位 base32（去除易混字符）。
 * 完整展示形态 "QJHY-AB12CD"。重复时重试。
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 去掉 0/O/1/I/L
const CODE_LEN = 6;

function generateCodeRaw(): string {
  const buf = randomBytes(CODE_LEN);
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) {
    const byte = buf[i] ?? 0;
    out += ALPHABET[byte % ALPHABET.length];
  }
  return out;
}

/** 数据库里以原始 6 位存储；UI 展示拼 "QJHY-XXXXXX" */
export function formatCodeForDisplay(raw: string): string {
  return `QJHY-${raw}`;
}

/** 接受 "XXXXXX" 或 "QJHY-XXXXXX"，去前缀返回原始 6 位 */
export function normalizeCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/^QJHY-/, "")
    .replace(/[^A-Z0-9]/g, "");
}

async function nextUniqueCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = generateCodeRaw();
    const [exists] = await db
      .select({ code: auth_invite_code.code })
      .from(auth_invite_code)
      .where(eq(auth_invite_code.code, code));
    if (!exists) return code;
  }
  throw new Error("INVITE_CODE_GENERATE_RETRIES_EXHAUSTED");
}

/** admin 生成新邀请码（perms 已 zod 校验） */
export async function generateInviteCode(input: {
  perms: InviteCodePermSpec[];
  max_uses: number;
  expires_at: Date | null;
  account_expire_at: Date | null;
  note: string | null;
  created_by: string;
}): Promise<{ code: string }> {
  const code = await nextUniqueCode();
  await db.insert(auth_invite_code).values({
    code,
    perms: input.perms,
    max_uses: input.max_uses,
    used_count: 0,
    expires_at: input.expires_at,
    account_expire_at: input.account_expire_at,
    note: input.note,
    created_by: input.created_by,
  });
  return { code };
}

/** admin 撤销邀请码（不删除，标记 revoked_at） */
export async function revokeInviteCode(code: string): Promise<{ ok: true }> {
  const normalized = normalizeCode(code);
  await db
    .update(auth_invite_code)
    .set({ revoked_at: sql`NOW()` })
    .where(and(eq(auth_invite_code.code, normalized), sql`revoked_at IS NULL`));
  return { ok: true };
}

function deriveStatus(row: {
  used_count: number;
  max_uses: number;
  expires_at: Date | null;
  revoked_at: Date | null;
}): InviteCodeRow["status"] {
  if (row.revoked_at) return "revoked";
  if (row.expires_at && row.expires_at.getTime() < Date.now()) return "expired";
  if (row.used_count >= row.max_uses) return "exhausted";
  return "active";
}

/** admin 列表邀请码（按创建时间倒序） */
export async function listInviteCodes(): Promise<InviteCodeRow[]> {
  const rows = await db
    .select({
      code: auth_invite_code.code,
      perms: auth_invite_code.perms,
      max_uses: auth_invite_code.max_uses,
      used_count: auth_invite_code.used_count,
      expires_at: auth_invite_code.expires_at,
      account_expire_at: auth_invite_code.account_expire_at,
      revoked_at: auth_invite_code.revoked_at,
      note: auth_invite_code.note,
      created_by: auth_invite_code.created_by,
      created_at: auth_invite_code.created_at,
      created_by_name: dingtalk_user.name,
    })
    .from(auth_invite_code)
    .leftJoin(dingtalk_user, eq(dingtalk_user.user_id, auth_invite_code.created_by))
    .orderBy(desc(auth_invite_code.created_at));

  return rows.map((r) => ({
    code: r.code,
    perms: r.perms as InviteCodePermSpec[],
    max_uses: r.max_uses,
    used_count: r.used_count,
    expires_at: r.expires_at?.toISOString() ?? null,
    account_expire_at: r.account_expire_at?.toISOString() ?? null,
    revoked_at: r.revoked_at?.toISOString() ?? null,
    note: r.note,
    created_by: r.created_by,
    created_by_name: r.created_by_name,
    created_at: r.created_at.toISOString(),
    status: deriveStatus({
      used_count: r.used_count,
      max_uses: r.max_uses,
      expires_at: r.expires_at,
      revoked_at: r.revoked_at,
    }),
  }));
}

/** 列出某 code 的所有使用记录（admin 审计用） */
export async function listInviteCodeUses(code: string): Promise<InviteCodeUseRow[]> {
  const normalized = normalizeCode(code);
  const rows = await db
    .select({
      id: auth_invite_code_use.id,
      code: auth_invite_code_use.code,
      auth_user_id: auth_invite_code_use.auth_user_id,
      dingtalk_user_id: auth_invite_code_use.dingtalk_user_id,
      used_at: auth_invite_code_use.used_at,
      user_email: auth_user.email,
      user_name: auth_user.name,
    })
    .from(auth_invite_code_use)
    .leftJoin(auth_user, eq(auth_user.id, auth_invite_code_use.auth_user_id))
    .where(eq(auth_invite_code_use.code, normalized))
    .orderBy(desc(auth_invite_code_use.used_at));

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    auth_user_id: r.auth_user_id,
    dingtalk_user_id: r.dingtalk_user_id,
    used_at: r.used_at.toISOString(),
    user_email: r.user_email,
    user_name: r.user_name,
  }));
}

/**
 * 注册流程消费邀请码：
 * 在事务里原子校验 + 自增 used_count；返回 perms 给调用方应用到权限表。
 * 失败抛具体错误码（INVITE_NOT_FOUND / INVITE_REVOKED / INVITE_EXPIRED / INVITE_EXHAUSTED）。
 */
export async function consumeInviteCodeAndCreateUser(input: {
  code: string;
  authUserId: string;
  name: string;
}): Promise<{
  dingtalkUserId: string;
  perms: InviteCodePermSpec[];
  accountExpireAt: Date | null;
}> {
  const normalized = normalizeCode(input.code);

  return await db.transaction(async (tx) => {
    // 锁住该邀请码行（防并发用尽）
    const [row] = await tx
      .select()
      .from(auth_invite_code)
      .where(eq(auth_invite_code.code, normalized))
      .for("update");

    if (!row) throw new Error("INVITE_NOT_FOUND");
    if (row.revoked_at) throw new Error("INVITE_REVOKED");
    if (row.expires_at && row.expires_at.getTime() < Date.now()) {
      throw new Error("INVITE_EXPIRED");
    }
    if (row.used_count >= row.max_uses) throw new Error("INVITE_EXHAUSTED");

    // 创建对应的 dingtalk_user 影子条目（is_external=true，user_id 用 ext_ 前缀）
    const extUserId = `ext_${randomUUID()}`;
    await tx.insert(dingtalk_user).values({
      user_id: extUserId,
      unionid: extUserId, // 占位（unionid NOT NULL UNIQUE）；外部用户不会走钉钉链路
      name: input.name,
      mobile: null,
      title: null,
      dept_ids: [],
      active: true,
      raw: { external: true, source: "invite_code", invite_code: normalized },
      is_external: true,
      auth_user_id: input.authUserId,
    });

    // 写权限 override：邀请码 perms 数组每行一条
    if ((row.perms as InviteCodePermSpec[]).length > 0) {
      await tx.insert(auth_permission_override).values(
        (row.perms as InviteCodePermSpec[]).map((p) => ({
          user_id: extUserId,
          module: p.module,
          scope: p.scope,
          can_edit: p.can_edit,
          can_export: p.can_export,
          can_admin: p.can_admin,
          reason: `邀请码注册：${normalized}`,
          expires_at: row.account_expire_at,
          created_by: row.created_by,
        })),
      );
    }

    // used_count++ + 写审计
    await tx
      .update(auth_invite_code)
      .set({ used_count: sql`used_count + 1` })
      .where(eq(auth_invite_code.code, normalized));

    await tx.insert(auth_invite_code_use).values({
      id: randomUUID(),
      code: normalized,
      auth_user_id: input.authUserId,
      dingtalk_user_id: extUserId,
    });

    return {
      dingtalkUserId: extUserId,
      perms: row.perms as InviteCodePermSpec[],
      accountExpireAt: row.account_expire_at,
    };
  });
}

/** 注册页面预查：根据 code 返回是否可用 + perms 预览 */
export async function previewInviteCode(
  code: string,
): Promise<
  | { ok: true; perms: InviteCodePermSpec[]; remaining: number; note: string | null }
  | { ok: false; reason: "not_found" | "revoked" | "expired" | "exhausted" }
> {
  const normalized = normalizeCode(code);
  if (!normalized) return { ok: false, reason: "not_found" };

  const [row] = await db
    .select()
    .from(auth_invite_code)
    .where(eq(auth_invite_code.code, normalized));

  if (!row) return { ok: false, reason: "not_found" };
  if (row.revoked_at) return { ok: false, reason: "revoked" };
  if (row.expires_at && row.expires_at.getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (row.used_count >= row.max_uses) return { ok: false, reason: "exhausted" };

  return {
    ok: true,
    perms: row.perms as InviteCodePermSpec[],
    remaining: row.max_uses - row.used_count,
    note: row.note,
  };
}
