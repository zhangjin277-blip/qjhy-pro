import type { ModuleKey } from "@/modules/permissions";
import type { Scope } from "@/modules/permissions";

export interface InviteCodePermSpec {
  module: ModuleKey;
  scope: Scope;
  can_edit: boolean;
  can_export: boolean;
  can_admin: boolean;
}

export interface InviteCodeRow {
  code: string;
  perms: InviteCodePermSpec[];
  max_uses: number;
  used_count: number;
  expires_at: string | null; // ISO
  account_expire_at: string | null; // ISO
  revoked_at: string | null;
  note: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  /** 派生状态 */
  status: "active" | "exhausted" | "expired" | "revoked";
}

export interface InviteCodeUseRow {
  id: string;
  code: string;
  auth_user_id: string;
  dingtalk_user_id: string;
  used_at: string;
  user_email: string | null;
  user_name: string | null;
}

/** 邀请码注册输入 */
export interface ConsumeInviteResult {
  ok: true;
  auth_user_id: string;
  dingtalk_user_id: string;
}
