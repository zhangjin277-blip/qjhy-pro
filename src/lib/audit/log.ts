import { db } from "@/db/client";
import { audit_log } from "@/db/schema";

export interface AuditLogInput {
  user_id: string | null;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string | null;
  user_agent?: string | null;
}

/**
 * 写审计日志。失败不抛异常（避免审计写失败破坏主业务）。
 */
export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await db.insert(audit_log).values({
      user_id: input.user_id,
      action: input.action,
      target_type: input.target_type ?? null,
      target_id: input.target_id ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      ip: input.ip ?? null,
      user_agent: input.user_agent ?? null,
    });
  } catch (err) {
    console.error("[audit] writeAuditLog failed:", err);
    // 故意不抛异常
  }
}
