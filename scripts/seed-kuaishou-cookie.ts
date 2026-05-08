/**
 * 从 chrome-devtools 抓到的快手机构后台 cookie，UPSERT 进 crawler_cookie_session（basecamp='kuaishou'）。
 * 一次性脚本，跑一次后即可：pnpm tsx scripts/seed-kuaishou-cookie.ts
 *
 * 注意：cookie 含 HttpOnly 项 (kuaishou.web.cp.api_st)，必须从 network request header 抓取，
 * 不能只用 document.cookie。
 */
import "dotenv/config";
import { db } from "../src/db/client";
import { crawler_cookie_session } from "../src/db/schema";

// 从 chrome-devtools 浏览器 reqid=478 (POST /rest/cp/org/member/manage/v3/list) request header 抓的完整 cookies
const COOKIES: Record<string, string> = {
  _did: "web_206605540E262D91",
  did: "web_9264b6e83aec2658f4e291ed4565e0b6be32",
  kwfv1:
    "PnGU+9+Y8008S+nH0U+0mjPf8fP08f+98f+nLlwnrIP9P78/Sj+fHhweHU8/Hl+AYYP/P98ezY+AWh+eLMwe+SP0pf+eqA8erh8BLAP0ZAweGM+AZ780SSP9HhG0p0weDA80+fweqU+eSf8/ZA+/zSP0Hh+nHEGfcMP0mj+ArMG/L=",
  bUserId: "1000010300487",
  userId: "3388565751",
  "kuaishou.web.cp.api_st":
    "ChZrdWFpc2hvdS53ZWIuY3AuYXBpLnN0ErABc7Sltg6WjlZuM1Xd_MHau-bhkemIZ8RPlXf10-FMkqdbVXXSGa6qmtdtJ7nvSenEf6bE0VwQYCl152pL4XNA3dOK0bF0ARwXJiffSZ-d-wMqwImpd95KYpg54rKE1qeFIAElMqmQh9rz5-1_x-RIYaciDzUzd6Fx9qz56BwaAFDJA_6UELSlVk0RrXIkAgR1zCFbdF-38jx4zqBub0CDgje2F0ZefqS3Hspa2uaQQrAaEv0gdvCawq0mCW4gOCQK25RG3iIgx1ivucQCpBveDam5KD2sxYz-IxKG6mjANwhFWHxufs4oBTAB",
  "kuaishou.web.cp.api_ph": "bfccb07091160acef9ee513e0ea491725737",
};

async function main(): Promise<void> {
  await db
    .insert(crawler_cookie_session)
    .values({
      basecamp: "kuaishou",
      cookies: COOKIES,
      status: "active",
      captured_at: new Date(),
      updated_at: new Date(),
    })
    .onConflictDoUpdate({
      target: crawler_cookie_session.basecamp,
      set: {
        cookies: COOKIES,
        status: "active",
        captured_at: new Date(),
        last_check_at: new Date(),
        updated_at: new Date(),
      },
    });
  console.log("[kuaishou-cookie] saved", Object.keys(COOKIES).length, "cookies");
  process.exit(0);
}

void main();
