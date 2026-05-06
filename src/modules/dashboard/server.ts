import "server-only";
export {
  getDashboardOverview,
  getCoreKpis,
  getSection2Breakdown,
  getDrawerDetail,
} from "./queries";
export { resolveDashboardScope } from "./scope";
export type { DashboardScope } from "./scope";
