import "server-only";
import { latestRun } from "./db";
import { view } from "./near-server";
import type { AgentView, JobView, ReservationView } from "./types";

async function res(id: string) {
  return view<ReservationView | null>("get_reservation", { reservation_id: id }).catch(() => null);
}

export async function jobDetail(jobId: number) {
  const [job, agents] = await Promise.all([view<JobView | null>("get_job", { job_id: jobId }), view<AgentView[]>("list_agents", { job_id: jobId })]);
  if (!job) return null;
  const usage = await Promise.all(
    agents.map(async (a) => {
      const ids = [`tb-guard-${a.id}`, `tb-work-${a.id}-1`, `tb-work-${a.id}-2`, `tb-work-${a.id}-3`];
      const found = (await Promise.all(ids.map(res))).filter(Boolean) as ReservationView[];
      return [a.id, found] as const;
    }),
  );
  const review = ((await Promise.all([1, 2, 3].map((n) => res(`tb-review-${jobId}-${n}`)))).filter(Boolean)) as ReservationView[];
  const run = await latestRun(jobId).catch(() => null);
  return { job, agents, reservations: Object.fromEntries(usage), review, run };
}
