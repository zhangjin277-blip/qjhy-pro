import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DINGTALK_APP_KEY: z.string().default(""),
  DINGTALK_APP_SECRET: z.string().default(""),
  DINGTALK_CORP_ID: z.string().default(""),
  DINGTALK_BOT_WEBHOOK: z.string().url().or(z.literal("")).default(""),
  EDITING_DINGTALK_WEBHOOK: z.string().url().or(z.literal("")).default(""),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 chars"),
  EMERGENCY_LOGIN_PASSWORD: z
    .string()
    .min(16, "EMERGENCY_LOGIN_PASSWORD must be at least 16 chars"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
