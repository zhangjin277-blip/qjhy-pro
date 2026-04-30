import cron from "node-cron";

export interface Job {
  name: string;
  schedule: string; // cron expression
  task: () => Promise<void>;
}

const jobs: Job[] = [];

export function registerJob(job: Job): void {
  jobs.push(job);
  console.log(`[scheduler] registered: ${job.name} (${job.schedule})`);
}

export function startScheduler(): void {
  for (const job of jobs) {
    cron.schedule(job.schedule, async () => {
      const start = Date.now();
      console.log(`[scheduler] ▶ ${job.name} starting`);
      try {
        await job.task();
        console.log(`[scheduler] ✓ ${job.name} done in ${Date.now() - start}ms`);
      } catch (err) {
        console.error(`[scheduler] ✗ ${job.name} failed:`, err);
      }
    });
  }
  console.log(`[scheduler] started ${jobs.length} jobs`);
}

export function listJobs(): Job[] {
  return [...jobs];
}
