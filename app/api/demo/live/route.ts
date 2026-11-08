import { connection, NextResponse } from "next/server";
import { LIVE_CALL_BUDGET, LIVE_CALL_PLAN, liveReadiness } from "@/lib/live-job";

export async function GET() {
  await connection();
  const status = liveReadiness();
  return NextResponse.json(
    {
      ok: false,
      complete: false,
      ready: status.ready,
      blocker: status.blocker,
      env: "NEAR_AI_API_KEY",
      mode: "TASKBOND_AI_MODE",
      budget: LIVE_CALL_BUDGET,
      plan: LIVE_CALL_PLAN,
      note: "This endpoint does not run the model. A sanctioned host must set NEAR_AI_API_KEY and TASKBOND_AI_MODE=live, then the same bounded plan is what a live job is allowed to call.",
    },
    { status: status.ready ? 200 : 503 },
  );
}

export async function POST() {
  await connection();
  const status = liveReadiness();
  if (!status.ready) {
    return NextResponse.json(
      {
        ok: false,
        complete: false,
        started: false,
        blocker: status.blocker,
        budget: LIVE_CALL_BUDGET,
        plan: LIVE_CALL_PLAN,
      },
      { status: 503 },
    );
  }
  return NextResponse.json(
    {
      ok: false,
      complete: false,
      started: false,
      blocker:
        "Env is set, but this build does not start the model loop. Wire the six planned calls through reserve, chatJson, and settle on the sanctioned host. No completion was requested.",
      budget: LIVE_CALL_BUDGET,
      plan: LIVE_CALL_PLAN,
    },
    { status: 501 },
  );
}
