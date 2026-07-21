import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runWeekEnrollmentImport } from "@/lib/week-enrollment-import";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== UserRole.EXECUTIVE_ADMIN) {
    return NextResponse.json({ error: "Executive Admin access required." }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const commit = formData.get("commit") === "true";
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await runWeekEnrollmentImport(prisma, buffer, commit);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ result });
}
