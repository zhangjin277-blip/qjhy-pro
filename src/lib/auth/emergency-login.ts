import { env } from "@/lib/env";
import { notifyDingtalk } from "@/lib/notify";

const EMERGENCY_USER_ID = "emergency-admin";
const EMERGENCY_USER_EMAIL = "emergency@qjhy.local";

/**
 * 应急后门登录校验。
 * 仅在钉钉登录不可用时使用，所有调用都会被钉钉机器人通知。
 */
export async function verifyEmergencyPassword(password: string): Promise<boolean> {
  if (!password || password !== env.EMERGENCY_LOGIN_PASSWORD) {
    return false;
  }

  notifyDingtalk({
    title: "EMERGENCY_LOGIN",
    detail: `应急账号登录成功 - 请确认是否为本人操作`,
    context: { timestamp: new Date().toISOString() },
  }).catch((err) => {
    console.error("[emergency-login] notify failed:", err);
  });

  return true;
}

export const EMERGENCY_USER = {
  id: EMERGENCY_USER_ID,
  email: EMERGENCY_USER_EMAIL,
  name: "Emergency Admin",
};

export function isEmergencyUser(userId: string | undefined): boolean {
  return userId === EMERGENCY_USER_ID;
}
