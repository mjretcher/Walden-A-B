import { NextResponse } from "next/server";
import { clearGuestSession } from "@/lib/event-auth";

export async function POST() {
  await clearGuestSession();
  return NextResponse.json({ ok: true });
}
