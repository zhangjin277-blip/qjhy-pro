import type { TrendPoint } from "@/modules/placement/server";
import { TrendChart } from "./trend-chart";

interface TrendChartWrapperProps {
  data: TrendPoint[];
}

export function TrendChartWrapper({ data }: TrendChartWrapperProps) {
  return <TrendChart data={data} />;
}
