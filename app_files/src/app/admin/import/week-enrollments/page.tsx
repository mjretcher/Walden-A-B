import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { WeekEnrollmentUploader } from "./uploader";

export default async function WeekEnrollmentImportPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);

  return (
    <AppShell user={user}>
      <PageHeader
        title="Week Enrollment Import"
        eyebrow="CampMinder — Enrolled Child Sessions"
        description="Upload the CampMinder report with First Name, Last Name, and Enrolled Child Sessions columns. The session name is mapped to week blocks (e.g. 'Two weeks Second Session' = leaves after Wk 6; 'Second Session' = through Wk 7), which drives the week lines on registration cards and the leave labels on rosters. Existing week enrollments for matched campers are replaced. Preview first."
      />
      <WeekEnrollmentUploader />
    </AppShell>
  );
}
