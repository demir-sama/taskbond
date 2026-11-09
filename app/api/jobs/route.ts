import { connection } from "next/server";
import { view } from "@/lib/near-server";
import type { JobView } from "@/lib/types";

export async function GET() {
  await connection();
  const jobs = await view<JobView[]>("list_jobs");
  return Response.json({ jobs: jobs.reverse() }, { headers: { "Cache-Control": "no-store" } });
}
