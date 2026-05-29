"use server";

import { AttendanceMark, CamperStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function saveAttendance(formData: FormData) {
  const user = await requireUser();
  const offeringId = String(formData.get("offeringId"));
  const date = new Date(`${String(formData.get("date"))}T12:00:00`);
  const registrations = await prisma.registration.findMany({ where: { offeringId }, include: { offering: true } });

  for (const registration of registrations) {
    const mark = formData.get(`mark-${registration.id}`) as AttendanceMark | null;
    if (!mark) continue;
    const camperStatus = (formData.get(`status-${registration.id}`) as CamperStatus | null) ?? CamperStatus.ACTIVE;
    const note = String(formData.get(`note-${registration.id}`) ?? "").trim() || null;

    await prisma.attendanceRecord.upsert({
      where: {
        camperId_offeringId_date: {
          camperId: registration.camperId,
          offeringId,
          date
        }
      },
      create: {
        registrationId: registration.id,
        camperId: registration.camperId,
        offeringId,
        sessionId: registration.sessionId,
        date,
        mark,
        camperStatus,
        note,
        takenByUserId: user.id
      },
      update: {
        registrationId: registration.id,
        mark,
        camperStatus,
        note,
        takenByUserId: user.id
      }
    });
  }

  revalidatePath("/attendance");
}
