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

export default async function BunkManagementPrintPage({
  searchParams
}: {
  searchParams?: Promise<{ gender?: string }>;
}) {
  const user = await requireBunkManagementAccess("read");
  const params = searchParams ? await searchParams : {};
  const isExecAdmin = user.role === UserRole.EXECUTIVE_ADMIN;

  // Girls Side Head / Boys Side Head are hard-locked to their own gender
  // server-side -- the query param is only honored for EXECUTIVE_ADMIN.
  // This can never be bypassed by editing the URL.
  const gender: Gender = isExecAdmin
    ? (params.gender === "FEMALE" ? Gender.FEMALE : Gender.MALE)
    : (user.bunkManagementView as Gender);

  const session = await prisma.session.findFirst({ where: { active: true }, select: { id: true, name: true, cycle: true, year: true } });
  const genderLabel = gender === Gender.FEMALE ? "Girls" : "Boys";

  if (!session) {
    return (
      <AppShell user={user}>
        <PageHeader title="Print / Export" eyebrow="Bunk Management" description="No active session." backHref="/bunk-management" backLabel="Back to Bunk Management" />
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">There's no active session right now.</p>
      </AppShell>
    );
  }

  const cabins = await prisma.cabin.findMany({
    where: { gender },
    orderBy: [{ unit: "asc" }, { name: "asc" }],
    include: {
      campers: {
        where: { sessionId: session.id, active: true },
        select: {
          firstName: true,
          lastName: true,
          campGrade: true,
          counselorAssistant: true,
          sessionDesignations: { select: { label: true }, orderBy: { label: "asc" } }
        },
        orderBy: [{ counselorAssistant: "asc" }, { lastName: "asc" }]
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

  const units = Array.from(new Set(cabins.map((c) => c.unit))).sort();

  // Hand-picked OUT OF CABIN staff (see /bunk-management/out-of-cabin),
  // cabin-sheet flag only. Same render-time double-print guard as the
  // staff sheet: anyone since assigned to a cabin is excluded here.
  const outOfCabinStaff = await prisma.outOfCabinListing.findMany({
    where: {
      sessionId: session.id,
      showOnCabinSheet: true,
      staff: { active: true, cabinStaffAssignments: { none: { sessionId: session.id } } }
    },
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
    },
    orderBy: [{ staff: { lastName: "asc" } }, { staff: { firstName: "asc" } }]
  });

  // The late-arrival asterisk and its footer legend are driven by the
  // existing CamperSessionDesignation label system (matching an existing
  // designation whose label reads "late arrival", case-insensitive) --
  // there's no dedicated field for this, so this reads the same admin-
  // entered designations everything else in the app already uses. The
  // legend line only appears on a page if at least one camper on it is
  // actually flagged that way, same as the original sheet.
  const isLateArrival = (designations: { label: string }[]) => designations.some((d) => /late arrival/i.test(d.label));

  const now = new Date();
  const generatedAt = now.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });

  return (
    <AppShell user={user}>
      <div className="no-print">
        <PageHeader
          title="Print / Export"
          eyebrow={`Bunk Management · ${session.cycle} ${session.year}`}
          description="Styled to match the paper cabin sheets exactly -- same headcount math, same layout, generated instead of hand-typed."
          backHref="/bunk-management"
          backLabel="Back to Bunk Management"
        >
          {isExecAdmin ? (
            <div className="flex items-center gap-2">
              <a href="?gender=MALE" className={`rounded-lg border px-3 py-1 text-xs font-black ${gender === "MALE" ? "border-lake-500 bg-lake-50" : "border-slate-200 bg-white"}`}>Boys</a>
              <a href="?gender=FEMALE" className={`rounded-lg border px-3 py-1 text-xs font-black ${gender === "FEMALE" ? "border-lake-500 bg-lake-50" : "border-slate-200 bg-white"}`}>Girls</a>
            </div>
          ) : null}
          <a href="/bunk-management/print-staff" className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-black">Staff-only sheet</a>
          <PrintButton label="Print / Save PDF" />
        </PageHeader>
      </div>

      <div className="bunk-sheet">
        {units.map((unit, unitIndex) => {
          const unitCabins = cabins.filter((c) => c.unit === unit);
          const anyLateArrival = unitCabins.some((c) => c.campers.some((camper) => isLateArrival(camper.sessionDesignations)));
          const isLastUnit = unitIndex === units.length - 1;
          // OUT OF CABIN prints once per gender document, on the last
          // unit's page (no extra page). Its lifeguards feed that page's
          // legend check.
          const showOutOfCabin = isLastUnit && outOfCabinStaff.length > 0;
          const anyLifeguard =
            unitCabins.some((c) => c.cabinStaffAssignments.some((a) => isLifeguardStaff(a.staff))) ||
            (showOutOfCabin && outOfCabinStaff.some((listing) => isLifeguardStaff(listing.staff)));

          return (
            <section key={unit} className="bunk-sheet-page">
              <p className="bunk-sheet__unit-title">{genderLabel} {UNIT_LABEL[unit]} {session.cycle} {session.year}</p>
              <div className="bunk-sheet__cabin-grid">
                {unitCabins.map((cabin) => {
                  const regularCampers = cabin.campers.filter((c) => !c.counselorAssistant);
                  const cas = cabin.campers.filter((c) => c.counselorAssistant);
                  const staff = cabin.cabinStaffAssignments;
                  const total = regularCampers.length + staff.length + cas.length;
                  const parts = [regularCampers.length, staff.length];
                  if (cas.length > 0) parts.push(cas.length);
                  return (
                    <div key={cabin.id}>
                      <div className="bunk-sheet__cabin-box">
                        <p className="bunk-sheet__cabin-header">{cabin.name} ({parts.join("+")}={total})</p>
                        {staff.length > 0 || cas.length > 0 ? (
                          <div className="bunk-sheet__staff-cols">
                            <div>
                              {staff.map((a, i) => {
                                const roleLabel = deriveCabinRoleLabel(a.staff.position, a.staff.position2);
                                const lg = isLifeguardStaff(a.staff);
                                return (
                                  <div key={i}>{lg ? "*" : ""}{a.staff.firstName} {a.staff.lastName}{cabinRoleSuffix(roleLabel)}</div>
                                );
                              })}
                            </div>
                            <div>
                              {cas.map((c, i) => (
                                <div key={i}>{c.firstName} {c.lastName} (CA)</div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs italic text-slate-500">No staff assigned yet.</p>
                        )}
                      </div>

                      {regularCampers.length > 0 ? (
                        <table className="bunk-sheet__camper-table">
                          <tbody>
                            {regularCampers.map((camper, i) => (
                              <tr key={i}>
                                <td>{camper.firstName}{isLateArrival(camper.sessionDesignations) ? "*" : ""}</td>
                                <td>{camper.lastName}</td>
                                <td>{camper.campGrade ?? ""}</td>
                                <td>{camper.sessionDesignations[0]?.label ?? ""}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {showOutOfCabin ? (
                <div className="bunk-sheet__cabin-box" style={{ maxWidth: "3in", marginTop: "0.12in" }}>
                  <p className="bunk-sheet__cabin-header">OUT OF CABIN ({outOfCabinStaff.length})</p>
                  <div className="bunk-sheet__staff-cols">
                    <div>
                      {outOfCabinStaff.map((listing, i) => {
                        const roleLabel = deriveCabinRoleLabel(listing.staff.position, listing.staff.position2);
                        const lg = isLifeguardStaff(listing.staff);
                        return (
                          <div key={i}>{lg ? "*" : ""}{listing.staff.firstName} {listing.staff.lastName}{cabinRoleSuffix(roleLabel)}</div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}

              <p className="bunk-sheet__footer">
                {anyLateArrival ? <>*late arrival (campers) &middot; </> : null}
                {anyLifeguard ? <>*lifeguard certified (staff) &middot; </> : null}
                Generated from Bunk Management, {generatedAt}
              </p>
            </section>
          );
        })}
        {units.length === 0 ? <p className="text-sm text-slate-500">No cabins for {genderLabel.toLowerCase()} yet.</p> : null}
      </div>
    </AppShell>
  );
}
