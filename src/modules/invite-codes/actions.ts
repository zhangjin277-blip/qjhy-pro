"use server";

import { requireAdmin } from "@/lib/admin-guard";
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
  const { userId: opUser } = await requireAdmin();

  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    throw new AppError("INVITE_EXPIRES_IN_PAST", "过期时间必须晚于现在", 400);
  }

  const { code } = await generateInviteCode({
    perms: data.perms,
    max_uses: data.max_uses,
    expires_at: data.expires_at ? new Date(data.expires_at) : null,
    account_expire_at: data.account_expire_at ? new Date(data.account_expire_at) : null,
    note: data.note ?? null,
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
      note: data.note ?? null,
    },
  });

  return { ok: true, code, displayCode: formatCodeForDisplay(code) };
}

export async function revokeInviteCodeAction(input: unknown): Promise<{ ok: true }> {
  const data = RevokeInviteCodeInput.parse(input);
  const { userId: opUser } = await requireAdmin();
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
  await requireAdmin();
  return listInviteCodes();
}

export async function listInviteCodeUsesAction(code: string): Promise<InviteCodeUseRow[]> {
  await requireAdmin();
  return listInviteCodeUses(code);
}
