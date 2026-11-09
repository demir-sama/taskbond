import { body, collect } from "@/lib/api";
import { guardAgents, loadJob } from "@/lib/engine";

export const maxDuration = 120;

/** Guard every agent still pending on a job. The worst-case reserve comes from each agent's own deposit. */
export async function POST(req: Request) {
  const { jobId } = await body(req);
  return collect(async (emit) => {
    const { job, agents } = await loadJob(Number(jobId));
    if (!job || job.status !== "Open") throw new Error("Job is not open.");
    const pending = agents.filter((a) => a.status === "PendingGuard");
    if (!pending.length) throw new Error("No agent is waiting for the guard.");
    const v = await guardAgents(job, pending, emit);
    return Object.fromEntries(v);
  });
}
