"use server";

import { requirePoint } from "@/lib/admin-guard";
import { writeAuditLog } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import {
  generateInviteCode,
  revokeInviteCode,
  formatCodeForDisplay,
  listInviteCodes,
  listInviteCodeUses,
  normalizeCode,
} from "./server";
import { GenerateInviteCodeInput, RevokeInviteCodeInput } from "./schema";
import type { InviteCodeRow, InviteCodeUseRow } from "./types";

export async function generateInviteCodeAction(input: unknown): Promise<{
  ok: true;
  code: string;
  displayCode: string;
}> {
  const data = GenerateInviteCodeInput.parse(input);
  const { userId: opUser } = await requirePoint("permissions", "invite_codes");
  // 邀请码会将权限配置复制给新账号，必须具有授予个人权限的权限。
  await requirePoint("permissions", "manage_overrides");

  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    throw new AppError("INVITE_EXPIRES_IN_PAST", "过期时间必须晚于现在", 400);
  }

  const delegatedIds =
    data.delegated_user_ids && data.delegated_user_ids.length > 0 ? data.delegated_user_ids : null;

  const { code } = await generateInviteCode({
    perms: data.perms,
    max_uses: data.max_uses,
    expires_at: data.expires_at ? new Date(data.expires_at) : null,
    account_expire_at: data.account_expire_at ? new Date(data.account_expire_at) : null,
    note: data.note ?? null,
    delegated_user_ids: delegatedIds,
    created_by: opUser,
  });

  await writeAuditLog({
    user_id: opUser,
    action: "INVITE_CODE_GENERATED",
    target_type: "invite_code",
    target_id: code,
    after: {
      perms: data.perms,
      max_uses: data.max_uses,
      expires_at: data.expires_at ?? null,
      account_expire_at: data.account_expire_at ?? null,
      delegated_user_ids: delegatedIds,
      note: data.note ?? null,
    },
  });

  return { ok: true, code, displayCode: formatCodeForDisplay(code) };
}

export async function revokeInviteCodeAction(input: unknown): Promise<{ ok: true }> {
  const data = RevokeInviteCodeInput.parse(input);
  const { userId: opUser } = await requirePoint("permissions", "invite_codes");
  const normalized = normalizeCode(data.code);

  await revokeInviteCode(normalized);

  await writeAuditLog({
    user_id: opUser,
    action: "INVITE_CODE_REVOKED",
    target_type: "invite_code",
    target_id: normalized,
  });

  return { ok: true };
}

export async function listInviteCodesAction(): Promise<InviteCodeRow[]> {
  await requirePoint("permissions", "invite_codes");
  return listInviteCodes();
}

export async function listInviteCodeUsesAction(code: string): Promise<InviteCodeUseRow[]> {
  await requirePoint("permissions", "invite_codes");
  return listInviteCodeUses(code);
}
