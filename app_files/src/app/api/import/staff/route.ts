import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { importRealStaff, previewRealStaffImport } from "@/lib/real-data-import";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== UserRole.EXECUTIVE_ADMIN) {
    return NextResponse.json({ error: "Executive Admin access required." }, { status: 403 });
  }

  const { csv, commit, replaceSamples } = await request.json();
  const text = String(csv ?? "");
  const preview = await previewRealStaffImport(prisma, text);

  if (!commit) return NextResponse.json({ preview });

  const result = await importRealStaff(prisma, text, { replaceSamples: replaceSamples === true });
  return NextResponse.json({ preview, imported: result.imported, skipped: result.skipped, result });
}
