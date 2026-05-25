/**
 * 邀请码模块的 client-safe 入口。
 * server-only 函数（db queries）见 ./server。
 */
export type {
  InviteCodePermSpec,
  InviteCodeRow,
  InviteCodeUseRow,
  ConsumeInviteResult,
} from "./types";

export {
  InviteCodePermSpecSchema,
  GenerateInviteCodeInput,
  RevokeInviteCodeInput,
  RegisterByInviteInput,
  type GenerateInviteCodeInputType,
  type RegisterByInviteInputType,
} from "./schema";

export {
  generateInviteCodeAction,
  revokeInviteCodeAction,
  listInviteCodesAction,
  listInviteCodeUsesAction,
} from "./actions";

/** 客户端展示用：把 6 位裸码包装成 "QJHY-XXXXXX" */
export function formatInviteDisplayCode(raw: string): string {
  return `QJHY-${raw}`;
}
