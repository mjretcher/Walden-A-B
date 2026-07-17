import { Gender, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { requireBunkManagementAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cabinRoleSuffix, deriveCabinRoleLabel, isLifeguardStaff } from "@/lib/bunk-staff-tags";

const UNIT_LABEL: Record<string, string> = {
  UNIT1: "Unit 1",
  UNIT2: "Unit 2",
  UNIT3: "Unit 3",
  UNIT4: "Unit 4"
};

/**
 * STAFF-ONLY print sheet.
 *
 * Same visual language as the full cabin print view (bunk-sheet family in
 * globals.css: Arial Narrow, bold+underlined titles, solid black cabin
 * boxes, lifeguard asterisk + legend), but with the camper tables removed
 * so the whole side fits on a single page: page 1 = all boys cabins,
 * page 2 = all girls cabins, in one print job.
 *
 * Deliberate differences vs. /bunk-management/print:
 * - No gender toggle: an EXECUTIVE_ADMIN gets BOTH sides in one document
 *   (boys page then girls page). A Side Head still only ever gets their
 *   own side (single page) -- same server-side lock as the full sheet,
 *   driven by user.bunkManagementView, never by URL params.
 * - Unit labels are inline sub-headings inside one continuous grid per
 *   gender (grid-column: 1 / -1) so boxes flow densely and the page
 *   never overflows onto a second sheet.
 * - Cabin header shows the staff headcount only, e.g. "G2 (2+2=4)" =
 *   staff + CAs, since campers aren't on this sheet.
 */
export default async function BunkManagementStaffPrintPage() {
  const user = await requireBunkManagementAccess("read");
  const isExecAdmin = user.role === UserRole.EXECUTIVE_ADMIN;

  const genders: Gender[] = isExecAdmin
    ? [Gender.MALE, Gender.FEMALE]
    : [user.bunkManagementView as Gender];

  const session = await prisma.session.findFirst({
    where: { active: true },
    select: { id: true, name: true, cycle: true, year: true }
  });

  if (!session) {
    return (
      <AppShell user={user}>
        <PageHeader title="Staff Sheet" eyebrow="Bunk Management" description="No active session." backHref="/bunk-management" backLabel="Back to Bunk Management" />
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">There&apos;s no active session right now.</p>
      </AppShell>
    );
  }

  // Same query shape as the full print view: regular campers are fetched
  // only to drive the header headcount math (campers+staff+CAs=total,
  // identical to the paper sheets); CAs also print by name (CAs are
  // Camper records with counselorAssistant: true -- never Staff records).
  const cabins = await prisma.cabin.findMany({
    where: { gender: { in: genders } },
    orderBy: [{ unit: "asc" }, { name: "asc" }],
    include: {
      campers: {
        where: { sessionId: session.id, active: true },
        select: { firstName: true, lastName: true, counselorAssistant: true },
        orderBy: { lastName: "asc" }
      },
      cabinStaffAssignments: {
        where: { sessionId: session.id },
        select: {
          staff: {
            select: {
              firstName: true,
              lastName: true,
              position: true,
              position2: true,
              statusCertification: true,
              certifications: { select: { name: true } }
            }
          }
        }
      }
    }
  });

  const now = new Date();
  const generatedAt = now.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });

  return (
    <AppShell user={user}>
      <div className="no-print">
        <PageHeader
          title="Staff Sheet"
          eyebrow={`Bunk Management · ${session.cycle} ${session.year}`}
          description={
            isExecAdmin
              ? "Staff-only version of the cabin sheets -- no campers. Prints as one document: all boys cabins on page 1, all girls on page 2."
              : "Staff-only version of the cabin sheets for your side of camp -- no campers, one page."
          }
          backHref="/bunk-management"
          backLabel="Back to Bunk Management"
        >
          <a href="/bunk-management/print" className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-black">Full sheets (with campers)</a>
          <PrintButton label="Print / Save PDF" />
        </PageHeader>
      </div>

      <div className="bunk-sheet">
        {genders.map((gender) => {
          const genderLabel = gender === Gender.FEMALE ? "Girls" : "Boys";
          const genderCabins = cabins.filter((c) => c.gender === gender);
          const units = Array.from(new Set(genderCabins.map((c) => c.unit))).sort();
          const anyLifeguard = genderCabins.some((c) => c.cabinStaffAssignments.some((a) => isLifeguardStaff(a.staff)));

          return (
            <section key={gender} className="bunk-sheet-page bunk-staff-sheet">
              <p className="bunk-sheet__unit-title">{genderLabel} Staff {session.cycle} {session.year}</p>
              <div
                className="bunk-staff-sheet__unit-cols"
                style={{ gridTemplateColumns: `repeat(${Math.max(units.length, 1)}, minmax(0, 1fr))` }}
              >
                {units.map((unit) => {
                  const unitCabins = genderCabins.filter((c) => c.unit === unit);
                  return (
                    <div key={unit} className="bunk-staff-sheet__unit-col">
                      <p className="bunk-staff-sheet__unit-label">{UNIT_LABEL[unit] ?? unit} {genderLabel}</p>
                      {unitCabins.map((cabin) => {
                        const regularCount = cabin.campers.filter((c) => !c.counselorAssistant).length;
                        const cas = cabin.campers.filter((c) => c.counselorAssistant);
                        const staff = cabin.cabinStaffAssignments;
                        // Identical headcount math to the full cabin sheet:
                        // campers + staff (+ CAs when present) = total.
                        const total = regularCount + staff.length + cas.length;
                        const parts = [regularCount, staff.length];
                        if (cas.length > 0) parts.push(cas.length);
                        return (
                          <div key={cabin.id} className="bunk-sheet__cabin-box bunk-staff-sheet__box">
                            <p className="bunk-sheet__cabin-header">{cabin.name} ({parts.join("+")}={total})</p>
                            {staff.length + cas.length > 0 ? (
                              <div className="bunk-staff-sheet__names">
                                {staff.map((a, i) => {
                                  const roleLabel = deriveCabinRoleLabel(a.staff.position, a.staff.position2);
                                  const lg = isLifeguardStaff(a.staff);
                                  return (
                                    <div key={`s-${i}`}>{lg ? "*" : ""}{a.staff.firstName} {a.staff.lastName}{cabinRoleSuffix(roleLabel)}</div>
                                  );
                                })}
                                {cas.map((c, i) => (
                                  <div key={`ca-${i}`}>{c.firstName} {c.lastName} (CA)</div>
                                ))}
                              </div>
                            ) : (
                              <p className="bunk-staff-sheet__empty">No staff assigned yet.</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              <p className="bunk-sheet__footer">
                {anyLifeguard ? <>*lifeguard certified &middot; </> : null}
                Generated from Bunk Management, {generatedAt}
              </p>

              {genderCabins.length === 0 ? <p className="text-sm text-slate-500">No cabins for {genderLabel.toLowerCase()} yet.</p> : null}
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}
