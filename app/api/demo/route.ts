import { connection, NextResponse } from "next/server";
import { startDemo } from "@/lib/demo";
import { loadDesk } from "@/lib/desk";

export async function GET() {
  await connection();
  return NextResponse.json(loadDesk());
}

export async function POST() {
  await connection();
  void startDemo();
  return NextResponse.json({ started: true, demo: loadDesk().demo }, { status: 202 });
}
