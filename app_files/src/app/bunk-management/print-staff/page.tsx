import { Gender, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { requireBunkManagementAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isLifeguardStaff, staffRoleSuffix } from "@/lib/bunk-staff-tags";
import { sortCabinsForPrint } from "@/lib/cabin-print-order";

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

  // Hand-picked OUT OF CABIN staff (see /bunk-management/out-of-cabin).
  // The cabinStaffAssignments:none filter is the render-time safety net:
  // a listed staffer who has since been assigned a cabin is already in a
  // cabin box above and must not print twice.
  const outOfCabinStaff = await prisma.outOfCabinListing.findMany({
    where: {
      sessionId: session.id,
      showOnStaffSheet: true,
      staff: { active: true, cabinStaffAssignments: { none: { sessionId: session.id } } }
    },
    select: {
      side: true,
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
    },
    orderBy: [{ staff: { lastName: "asc" } }, { staff: { firstName: "asc" } }]
  });

  const now = new Date();
  const generatedAt = now.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });

  // Listings with no side set can't be placed (staff have no gender field;
  // the side IS the signal) — they're held out of print and flagged here.
  const unsidedOutOfCabin = outOfCabinStaff.filter((listing) => listing.side === null);

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
        {unsidedOutOfCabin.length > 0 ? (
          // Screen-only (no-print): paper stays clean, but whoever is
          // printing can't miss that someone is being held out.
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-black">
              {unsidedOutOfCabin.length} OUT OF CABIN staff {unsidedOutOfCabin.length === 1 ? "has" : "have"} no side set and will NOT print on any sheet:
            </p>
            <p className="mt-1">{unsidedOutOfCabin.map((l) => `${l.staff.firstName} ${l.staff.lastName}`).join(", ")}</p>
            <p className="mt-1">
              Boys print with the boys and girls with the girls — set each person&apos;s side on the{" "}
              <a className="font-black underline" href="/bunk-management/out-of-cabin">Out of Cabin page</a>.
            </p>
          </div>
        ) : null}
      </div>

      <div className="bunk-sheet">
        {genders.map((gender) => {
          const genderLabel = gender === Gender.FEMALE ? "Girls" : "Boys";
          const genderCabins = cabins.filter((c) => c.gender === gender);
          const units = Array.from(new Set(genderCabins.map((c) => c.unit))).sort();
          // SIDE RULE: boys print with the boys, girls with the girls — a
          // listing only prints on the page whose side matches it. Staff
          // records carry no gender field, so the listing's side IS the
          // gender signal; unsided listings are held out of print (they'd
          // otherwise mix onto both pages) and flagged in the screen-only
          // banner above.
          const genderOutOfCabin = outOfCabinStaff.filter((listing) => listing.side === gender);
          const anyLifeguard =
            genderCabins.some((c) => c.cabinStaffAssignments.some((a) => isLifeguardStaff(a.staff))) ||
            genderOutOfCabin.some((listing) => isLifeguardStaff(listing.staff));

          return (
            <section key={gender} className="bunk-sheet-page bunk-staff-sheet">
              <p className="bunk-sheet__unit-title">{genderLabel} Staff {session.cycle} {session.year}</p>
              <div
                className="bunk-staff-sheet__unit-cols"
                style={{ gridTemplateColumns: `repeat(${Math.max(units.length, 1)}, minmax(0, 1fr))` }}
              >
                {units.map((unit) => {
                  // Print order is age order, not alphabetical -- see
                  // cabin-print-order.ts (fixes B10-before-B7 and puts G4
                  // first in Unit 2 boys).
                  const unitCabins = sortCabinsForPrint(genderCabins.filter((c) => c.unit === unit), gender, unit);
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
                                  const lg = isLifeguardStaff(a.staff);
                                  return (
                                    <div key={`s-${i}`}>{lg ? "*" : ""}{a.staff.firstName} {a.staff.lastName}{staffRoleSuffix(a.staff)}</div>
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

              {/* OUT OF CABIN box — same styling as a cabin box. Strict side
                  match: only listings whose side equals this page's gender
                  print here (boys with boys, girls with girls). */}
              {genderOutOfCabin.length > 0 ? (
                <div className="bunk-sheet__cabin-box bunk-staff-sheet__box" style={{ maxWidth: "3in", marginTop: "0.12in" }}>
                  <p className="bunk-sheet__cabin-header">OUT OF CABIN ({genderOutOfCabin.length})</p>
                  <div className="bunk-staff-sheet__names">
                    {genderOutOfCabin.map((listing, i) => {
                      const lg = isLifeguardStaff(listing.staff);
                      return (
                        <div key={`ooc-${i}`}>{lg ? "*" : ""}{listing.staff.firstName} {listing.staff.lastName}{staffRoleSuffix(listing.staff)}</div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

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
