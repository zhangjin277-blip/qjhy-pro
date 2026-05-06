import { queryByHour } from "@/modules/placement/server";
import { resolveFilter } from "@/modules/placement";
import { HourMatrix } from "../_components/hour-matrix";

export default async function ByHourPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filter = resolveFilter(sp);
  const cells = await queryByHour(filter);
  return <HourMatrix cells={cells as never} />;
}
