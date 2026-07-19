import { Gender, UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { requireBunkManagementAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sortCabinsForPrint } from "@/lib/cabin-print-order";
import { CabinOrderClient } from "./client";

/**
 * Cabin Print Order — hand-set the order cabins print in on the bunk
 * sheets (both the full cabin sheets and the staff-only sheet), per unit.
 * Paper order is camper AGE order, which cabin names don't encode; this
 * page is the no-code way to express it (Cabin.sortOrder), replacing the
 * need to hard-code special cases in lib/cabin-print-order.ts.
 *
 * The lists below are shown ALREADY in effective print order (manual
 * order if set, otherwise the coded fallbacks) — so saving without
 * touching anything freezes today's order, and every arrow click shows
 * exactly what paper will do.
 *
 * Exec Admin only: print order is camp-wide configuration.
 */
export default async function CabinOrderPage() {
  const user = await requireBunkManagementAccess("read");
  if (user.role !== UserRole.EXECUTIVE_ADMIN) redirect("/bunk-management");

  const cabins = await prisma.cabin.findMany({
    orderBy: [{ unit: "asc" }, { name: "asc" }],
    select: { id: true, name: true, unit: true, gender: true, sortOrder: true }
  });

  // Group by gender then unit, each group pre-sorted into the order the
  // print pages would use right now.
  const groups: { gender: Gender; unit: string; cabins: { id: string; name: string; sortOrder: number | null }[] }[] = [];
  for (const gender of [Gender.MALE, Gender.FEMALE]) {
    const genderCabins = cabins.filter((c) => c.gender === gender);
    const units = Array.from(new Set(genderCabins.map((c) => c.unit))).sort();
    for (const unit of units) {
      const unitCabins = sortCabinsForPrint(genderCabins.filter((c) => c.unit === unit), gender, unit);
      groups.push({ gender, unit, cabins: unitCabins.map(({ id, name, sortOrder }) => ({ id, name, sortOrder })) });
    }
  }

  return (
    <AppShell user={user}>
      <PageHeader
        title="Cabin Print Order"
        eyebrow="Bunk Management"
        backHref="/bunk-management"
        backLabel="Back to Bunk Management"
        description="Set the order cabins print in on the bunk sheets, per unit — paper goes by camper age, not cabin name. Use the arrows and save each unit; the sheets pick it up on the next print. Units you never touch keep their automatic order."
      />
      <CabinOrderClient groups={groups} />
    </AppShell>
  );
}
