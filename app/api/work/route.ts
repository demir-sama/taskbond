import { body, collect } from "@/lib/api";
import { loadJob, runWorkers } from "@/lib/engine";

export const maxDuration = 120;

/** Run one approved agent on NEAR AI. Its owner then signs submit_result from their wallet. */
export async function POST(req: Request) {
  const { jobId, agentId } = await body(req);
  return collect(async (emit) => {
    const { job, agents } = await loadJob(Number(jobId));
    const agent = agents.find((a) => a.id === Number(agentId));
    if (!job || job.status !== "Open") throw new Error("Job is not open.");
    if (!agent || agent.status !== "Approved" || agent.review !== "None") throw new Error("Agent is not approved or already submitted.");
    const work = await runWorkers(job, [agent], emit, () => "ada");
    const w = work.get(agent.id);
    if (!w) throw new Error("The worker produced no result. Nothing to submit.");
    return { agentId: agent.id, summary: w.output.summary, steps: w.output.steps, evidence: w.evidence, valid: w.valid, invalid: w.invalid };
  });
}
