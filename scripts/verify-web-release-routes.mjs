import { readFile } from "node:fs/promises";

const manifestPath = process.argv[2] ?? ".next/server/app-paths-manifest.json";
const requiredRoutes = [
  "/(dashboard)/anchors/recruit/page",
  "/api/business-recruitment/import/route",
  "/(dashboard)/operations-performance/page",
  "/(dashboard)/people-performance/page",
  "/api/people-performance/goals/review/route",
  "/api/people-performance/cycles/route",
  "/api/people-performance/bulk-import/route",
  "/(dashboard)/projects/zhaohua/page",
  "/api/miniprogram/v1/dashboard/detail/route",
  "/api/miniprogram/v1/dashboard/overview/route",
  "/api/miniprogram/v1/performance/route",
];

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const missingRoutes = requiredRoutes.filter((route) => !(route in manifest));

if (missingRoutes.length > 0) {
  console.error(`Web release is missing required routes:\n${missingRoutes.join("\n")}`);
  process.exit(1);
}

console.log(`Verified ${requiredRoutes.length} required Web release routes.`);
