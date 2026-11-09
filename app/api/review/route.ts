import { body, collect } from "@/lib/api";
import { loadJob, payout, reviewJob } from "@/lib/engine";

export const maxDuration = 120;

/** Reviewer scores every pending submission; if one wins, the contract pays it. */
export async function POST(req: Request) {
  const { jobId } = await body(req);
  return collect(async (emit) => {
    const { job, agents } = await loadJob(Number(jobId));
    if (!job || job.status !== "Open") throw new Error("Job is not open.");
    if (job.winner_agent_id) {
      await payout(job.id, emit);
      return { winner: job.winner_agent_id };
    }
    const r = await reviewJob(job, agents, emit);
    if (r.winner) await payout(job.id, emit);
    return { winner: r.winner, failed: r.failed, scores: Object.fromEntries(r.scores) };
  });
}
