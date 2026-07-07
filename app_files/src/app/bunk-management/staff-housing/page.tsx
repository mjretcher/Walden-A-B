import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { requireBunkManagementAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StaffHousingClient } from "./client";

const DEFAULT_HOUSING_LABELS = ["Staff House", "Nurse Cabin", "Health Center", "Out of Cabin", "Office", "Leadership House"];

export default async function StaffHousingPage() {
  const user = await requireBunkManagementAccess("write");

  const staff = await prisma.staff.findMany({
    where: { active: true },
    select: { id: true, firstName: true, lastName: true, housingLabel: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
  });

  const rows = staff.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, housingLabel: s.housingLabel }));
  const customLabels = Array.from(new Set(rows.map((r) => r.housingLabel).filter((l): l is string => Boolean(l)))).sort();
  const housingOptions = Array.from(new Set([...DEFAULT_HOUSING_LABELS, ...customLabels])).sort();

  return (
    <AppShell user={user}>
      <PageHeader
        title="Staff Housing"
        eyebrow="Bunk Management"
        description="Non-cabin staff housing only — Nurse Cabin, Staff House, and similar. Real cabin/bunk assignment happens on the Assignment Board; this screen never touches that."
      />
      <StaffHousingClient staff={rows} housingOptions={housingOptions} />
    </AppShell>
  );
}
