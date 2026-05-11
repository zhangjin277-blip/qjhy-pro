/**
 * 一次性脚本：把 anchor_profile.broker_name 反向匹配到 dingtalk_user，写 broker_user_mapping。
 *
 * Usage:
 *   pnpm tsx --env-file=.env.local --conditions=react-server scripts/sync-brokers-once.ts
 */
import { syncBrokerMappings } from "@/modules/brokers/server";

async function main() {
  const result = await syncBrokerMappings();
  console.log(`[sync-brokers] matched=${result.matched} pending=${result.pending}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
