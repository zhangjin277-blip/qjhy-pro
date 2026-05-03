import { enqueue, JOB_NAMES } from "@/modules/crawler/queue";
async function main(): Promise<void> {
  const date = process.env.DATE ?? "2026-05-01";
  const id = await enqueue(JOB_NAMES.CHECK_DATA_READY, {
    date,
    basecamp: "cs" as const,
    attempt: 1,
  });
  console.log({ check_data_ready: id });
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
