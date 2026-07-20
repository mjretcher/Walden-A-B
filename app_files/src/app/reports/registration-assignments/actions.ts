"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RowInput = {
  section: string;
  label: string;
  staffId: string | null;
  camperId: string | null;
  customStaffName: string | null;
  sortOrder: number;
  isCustom: boolean;
  hidden: boolean;
};

export async function saveRegistrationAssignments(formData: FormData) {
  await requireUser([UserRole.EXECUTIVE_ADMIN]);

  const reportId = clean(formData.get("reportId"));
  const sessionId = clean(formData.get("sessionId")) || null;
  const registrationLabel = clean(formData.get("registrationLabel")) || "Registration Assignments";
  const registrationDate = parseDate(clean(formData.get("registrationDate")));
  const notes = clean(formData.get("notes")) || null;
  const [staffIds, camperIds] = await Promise.all([
    prisma.staff.findMany({ select: { id: true } }).then((records) => new Set(records.map((record) => record.id))),
    // Only CAs are pickable as camper rows -- validate against that set so
    // a stale/hand-mangled camperId can't attach a non-CA camper.
    prisma.camper
      .findMany({ where: { counselorAssistant: true }, select: { id: true } })
      .then((records) => new Set(records.map((record) => record.id)))
  ]);
  const rows = readRows(formData).map((row) => {
    const staffId = row.staffId && staffIds.has(row.staffId) ? row.staffId : null;
    // staffId wins if somehow both arrive; a row is one person, not two.
    const camperId = !staffId && row.camperId && camperIds.has(row.camperId) ? row.camperId : null;
    // A resolved staff/CA pick supersedes any leftover free-typed name.
    const customStaffName = staffId || camperId ? null : row.customStaffName;
    return { ...row, staffId, camperId, customStaffName };
  });

  const saved = await prisma.$transaction(async (tx) => {
    const report = reportId
      ? await tx.registrationAssignmentReport.update({
          where: { id: reportId },
          data: { sessionId, registrationLabel, registrationDate, notes }
        })
      : await tx.registrationAssignmentReport.create({
          data: { sessionId, registrationLabel, registrationDate, notes }
        });

    await tx.registrationAssignmentRow.deleteMany({ where: { reportId: report.id } });
    if (rows.length) {
      await tx.registrationAssignmentRow.createMany({
        data: rows.map((row) => ({ ...row, reportId: report.id }))
      });
    }

    return report;
  });

  revalidatePath("/reports/registration-assignments");
  revalidatePath("/exports");
  redirect(`/reports/registration-assignments?reportId=${saved.id}`);
}

function readRows(formData: FormData): RowInput[] {
  return formData
    .getAll("rowKey")
    .map((value) => String(value))
    .map((rowKey, index) => {
      const isCustom = clean(formData.get(`isCustom:${rowKey}`)) === "true";
      const hidden = clean(formData.get(`hidden:${rowKey}`)) === "true";
      const label = clean(formData.get(`label:${rowKey}`));
      const section = clean(formData.get(`section:${rowKey}`));
      const staffId = clean(formData.get(`staffId:${rowKey}`));
      const camperId = clean(formData.get(`camperId:${rowKey}`));
      const customStaffName = clean(formData.get(`customStaffName:${rowKey}`));
      const sortOrder = Number(clean(formData.get(`sortOrder:${rowKey}`)) || index);

      return {
        section,
        label,
        staffId,
        camperId: camperId || null,
        customStaffName: customStaffName || null,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : index,
        isCustom,
        hidden
      };
    })
    .filter((row) => row.section)
    .filter((row) => !row.isCustom || row.staffId || row.camperId || row.customStaffName || row.label);
}

function clean(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDate(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}
