"use server";

import { Period, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OPTIONALS_PERIODS } from "@/lib/optionals-assignments";

type RowInput = {
  period: Period;
  label: string;
  staffId: string | null;
  customStaffName: string | null;
  sortOrder: number;
};

const PERIOD_SET = new Set<string>(OPTIONALS_PERIODS);

function isOptionalsPeriod(value: string): value is Period {
  return PERIOD_SET.has(value);
}

export async function saveOptionalsAssignments(formData: FormData) {
  // Editing is open to Exec Admin and Area Heads -- unlike Registration
  // Assignments (Exec Admin only), this list is explicitly meant to be
  // maintained by "me or one of our programming staff" per Mike, and Area
  // Heads are the programming staff role in this app.
  await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);

  const reportId = clean(formData.get("reportId"));
  const sessionId = clean(formData.get("sessionId")) || null;
  const label = clean(formData.get("label")) || "Optionals";
  const reportDate = parseDate(clean(formData.get("reportDate")));
  const notes = clean(formData.get("notes")) || null;
  const staffIds = new Set((await prisma.staff.findMany({ select: { id: true } })).map((staff) => staff.id));
  const rows = readRows(formData).map((row) => ({
    ...row,
    staffId: row.staffId && staffIds.has(row.staffId) ? row.staffId : null
  }));

  const saved = await prisma.$transaction(async (tx) => {
    const report = reportId
      ? await tx.optionalsAssignmentReport.update({
          where: { id: reportId },
          data: { sessionId, label, reportDate, notes }
        })
      : await tx.optionalsAssignmentReport.create({
          data: { sessionId, label, reportDate, notes }
        });

    await tx.optionalsAssignmentRow.deleteMany({ where: { reportId: report.id } });
    if (rows.length) {
      await tx.optionalsAssignmentRow.createMany({
        data: rows.map((row) => ({ ...row, reportId: report.id }))
      });
    }

    return report;
  });

  revalidatePath("/reports/optionals-assignments");
  revalidatePath("/exports");
  redirect(`/reports/optionals-assignments?reportId=${saved.id}`);
}

function readRows(formData: FormData): RowInput[] {
  return formData
    .getAll("rowKey")
    .map((value) => String(value))
    .map((rowKey, index) => {
      const label = clean(formData.get(`label:${rowKey}`));
      const period = clean(formData.get(`period:${rowKey}`));
      const staffId = clean(formData.get(`staffId:${rowKey}`));
      const customStaffName = clean(formData.get(`customStaffName:${rowKey}`));
      const sortOrder = Number(clean(formData.get(`sortOrder:${rowKey}`)) || index);

      return {
        period,
        label,
        staffId,
        customStaffName: customStaffName || null,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : index
      };
    })
    .filter((row): row is RowInput & { period: string } => isOptionalsPeriod(row.period))
    .filter((row) => row.label || row.staffId || row.customStaffName)
    .map((row) => ({ ...row, period: row.period as Period }));
}

function clean(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDate(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}
