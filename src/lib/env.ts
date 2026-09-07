import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DINGTALK_APP_KEY: z.string().default(""),
  DINGTALK_APP_SECRET: z.string().default(""),
  DINGTALK_CORP_ID: z.string().default(""),
  DINGTALK_AGENT_ID: z.string().default(""),
  DINGTALK_CLI_PATH: z.string().default("dws"),
  DINGTALK_RECRUITMENT_SHEET_URL: z
    .string()
    .url()
    .default(
      "https://alidocs.dingtalk.com/i/nodes/X6GRezwJlYBBZd3LurM9aqmN8dqbropQ?utm_scene=person_space",
    ),
  DINGTALK_RECRUITMENT_SHEET_ID: z.string().default("st-da2f6966-43922"),
  DINGTALK_BOT_WEBHOOK: z.string().url().or(z.literal("")).default(""),
  EDITING_DINGTALK_WEBHOOK: z.string().url().or(z.literal("")).default(""),
  // Cookie 失效提醒专用机器人（关键字「更新」）—— 抖音/快手 cookie 需续期时通知
  COOKIE_ALERT_DINGTALK_WEBHOOK: z.string().url().or(z.literal("")).default(""),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 chars"),
  EMERGENCY_LOGIN_PASSWORD: z
    .string()
    .min(16, "EMERGENCY_LOGIN_PASSWORD must be at least 16 chars"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  MINIPROGRAM_DEV_USER_ID: z.string().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
