import { Gender, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Field, PageHeader, inputClass, secondaryButtonClass } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isLifeguardStaff, staffRoleSuffix } from "@/lib/bunk-staff-tags";
import { sortCabinsForPrint } from "@/lib/cabin-print-order";
import { CAMP_TIME_ZONE, formatGeneratedAt } from "@/lib/camp-time";
import { UNIT_LABEL } from "@/lib/periods";

type SearchParams = { reportId?: string };

function toDateLabel(date: Date | null) {
  return date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: CAMP_TIME_ZONE }) : "";
}

/**
 * REGISTRATION CABIN COVERAGE CHECK.
 *
 * The Registration Assignments sheet pulls staff out of their cabins to
 * work the dining-room tables ("all other staff are to remain with their
 * campers"). This report is the cross-check: the staff-only bunk sheet
 * (same bunk-sheet CSS family, same age-order cabin sort) with every
 * staff member who appears on the selected Registration Assignments
 * report printed with a STRIKETHROUGH -- and, because the real question
 * is "did we wipe a cabin," any cabin whose ENTIRE staff list is struck
 * gets a flagged header + dashed border that can't be missed on paper.
 *
 * Read-only against both source systems: never writes to
 * CabinStaffAssignment or RegistrationAssignmentRow (same principle as
 * the Optionals report's read-only rule for StaffAssignment).
 *
 * Matching is by staffId, so free-typed customStaffName rows on the
 * registration sheet can't be cross-checked automatically -- those names
 * are surfaced in a screen-only banner for a manual eyeball instead of
 * being silently ignored. CAs are Camper records (never Staff), can't be
 * assigned to registration tables by ID, and do NOT count as coverage:
 * a cabin whose only unstruck name is a CA is still flagged as wiped.
 */
export default async function RegistrationCoveragePage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const params = searchParams ? await searchParams : {};

  const [session, reports] = await Promise.all([
    prisma.session.findFirst({ where: { active: true }, select: { id: true, name: true, cycle: true, year: true } }),
    prisma.registrationAssignmentReport.findMany({ orderBy: { updatedAt: "desc" }, take: 20 })
  ]);

  if (!session) {
    return (
      <AppShell user={user}>
        <PageHeader title="Registration Cabin Coverage" eyebrow="Reports" description="No active session." backHref="/reports" backLabel="Back to Reports" />
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">There&apos;s no active session right now.</p>
      </AppShell>
    );
  }

  const selectedReportId = params.reportId ?? reports[0]?.id;
  const report = selectedReportId
    ? await prisma.registrationAssignmentReport.findUnique({
        where: { id: selectedReportId },
        include: { rows: { where: { hidden: false } } }
      })
    : null;

  const rows = report?.rows ?? [];
  const pulledStaffIds = new Set(rows.map((row) => row.staffId).filter((id): id is string => Boolean(id)));
  // Free-typed names can't be matched to Staff records -- surfaced below
  // for a manual check rather than silently skipped.
  const uncheckableNames = Array.from(
    new Set(rows.filter((row) => !row.staffId && row.customStaffName?.trim()).map((row) => row.customStaffName!.trim()))
  ).sort();

  const [cabins, outOfCabinStaff] = await Promise.all([
    prisma.cabin.findMany({
      orderBy: [{ unit: "asc" }, { name: "asc" }],
      include: {
        campers: {
          where: { sessionId: session.id, active: true, counselorAssistant: true },
          select: { firstName: true, lastName: true },
          orderBy: { lastName: "asc" }
        },
        cabinStaffAssignments: {
          where: { sessionId: session.id },
          select: {
            staffId: true,
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
    }),
    prisma.outOfCabinListing.findMany({
      where: {
        sessionId: session.id,
        showOnStaffSheet: true,
        staff: { active: true, cabinStaffAssignments: { none: { sessionId: session.id } } }
      },
      select: {
        side: true,
        staffId: true,
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
    })
  ]);

  // The two coverage states worth calling out on screen: wiped (every
  // assigned staffer is at registration) and thin (exactly one left).
  const wipedCabins = cabins.filter(
    (cabin) => cabin.cabinStaffAssignments.length > 0 && cabin.cabinStaffAssignments.every((a) => pulledStaffIds.has(a.staffId))
  );
  const thinCabins = cabins.filter(
    (cabin) =>
      cabin.cabinStaffAssignments.length > 1 &&
      cabin.cabinStaffAssignments.filter((a) => !pulledStaffIds.has(a.staffId)).length === 1
  );
  const pulledWithCabinCount = cabins.reduce(
    (count, cabin) => count + cabin.cabinStaffAssignments.filter((a) => pulledStaffIds.has(a.staffId)).length,
    0
  );

  const generatedAt = formatGeneratedAt();
  const reportLabel = report ? `${report.registrationLabel}${report.registrationDate ? ` (${toDateLabel(report.registrationDate)})` : ""}` : null;

  return (
    <AppShell user={user}>
      <div className="no-print">
        <PageHeader
          title="Registration Cabin Coverage"
          eyebrow={`Reports · ${session.cycle} ${session.year}`}
          description="Staff-only bunk sheet with everyone assigned to registration tables struck through — a paper double-check that no cabin is left without staff on registration day."
          backHref="/reports"
          backLabel="Back to Reports"
        >
          <a href={report ? `/reports/registration-assignments?reportId=${report.id}` : "/reports/registration-assignments"} className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-black">
            Registration Assignments
          </a>
          <PrintButton label="Print / Save PDF" />
        </PageHeader>

        <section className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
          <form action="/reports/registration-coverage" className="grid gap-3 lg:grid-cols-[1fr_auto]" method="get">
            <Field label="Check against saved Registration Assignments report">
              <select className={inputClass} defaultValue={report?.id ?? ""} name="reportId">
                {reports.length ? null : <option value="">No saved reports yet</option>}
                {reports.map((savedReport) => (
                  <option key={savedReport.id} value={savedReport.id}>
                    {savedReport.registrationLabel}
                    {savedReport.registrationDate ? ` - ${toDateLabel(savedReport.registrationDate)}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <button className={`${secondaryButtonClass} self-end`} type="submit">Check coverage</button>
          </form>
        </section>

        {!report ? (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-black">No Registration Assignments report to check against.</p>
            <p className="mt-1">
              Build one on the <a className="font-black underline" href="/reports/registration-assignments">Registration Assignments page</a> first — the sheet below prints with nothing struck through until then.
            </p>
          </div>
        ) : (
          <div className="mb-4 grid gap-3">
            <div className={`rounded-lg border p-4 text-sm ${wipedCabins.length ? "border-red-300 bg-red-50 text-red-900" : "border-green-300 bg-green-50 text-green-900"}`}>
              {wipedCabins.length ? (
                <>
                  <p className="font-black">
                    {wipedCabins.length} cabin{wipedCabins.length === 1 ? " has" : "s have"} ALL staff assigned to registration: {wipedCabins.map((c) => c.name).join(", ")}
                  </p>
                  <p className="mt-1">
                    Every assigned staff member in {wipedCabins.length === 1 ? "this cabin" : "these cabins"} is on &quot;{reportLabel}&quot;. CAs don&apos;t count as coverage. Fix on the{" "}
                    <a className="font-black underline" href={`/reports/registration-assignments?reportId=${report.id}`}>Registration Assignments page</a> or the{" "}
                    <a className="font-black underline" href="/bunk-management/board">Bunk Board</a>.
                  </p>
                </>
              ) : (
                <p className="font-black">
                  No cabins wiped — every cabin with assigned staff keeps at least one staff member not on &quot;{reportLabel}&quot;. ({pulledWithCabinCount} cabin staff pulled to tables in total.)
                </p>
              )}
            </div>
            {thinCabins.length ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-black">Thin coverage — exactly one staff member left in: {thinCabins.map((c) => c.name).join(", ")}</p>
              </div>
            ) : null}
            {uncheckableNames.length ? (
              <div className="rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-black">{uncheckableNames.length} free-typed name{uncheckableNames.length === 1 ? "" : "s"} on the registration sheet can&apos;t be auto-matched to staff records — eyeball these:</p>
                <p className="mt-1">{uncheckableNames.join(", ")}</p>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="bunk-sheet">
        {([Gender.MALE, Gender.FEMALE] as Gender[]).map((gender) => {
          const genderLabel = gender === Gender.FEMALE ? "Girls" : "Boys";
          const genderCabins = cabins.filter((c) => c.gender === gender);
          const units = Array.from(new Set(genderCabins.map((c) => c.unit))).sort();
          // Same side rule as the staff-only sheet: a listing only prints
          // on the page whose side matches; unsided listings are held out.
          const genderOutOfCabin = outOfCabinStaff.filter((listing) => listing.side === gender);
          const anyLifeguard =
            genderCabins.some((c) => c.cabinStaffAssignments.some((a) => isLifeguardStaff(a.staff))) ||
            genderOutOfCabin.some((listing) => isLifeguardStaff(listing.staff));

          return (
            <section key={gender} className="bunk-sheet-page bunk-staff-sheet">
              <p className="bunk-sheet__unit-title">{genderLabel} Staff — Registration Coverage {session.cycle} {session.year}</p>
              <div
                className="bunk-staff-sheet__unit-cols"
                style={{ gridTemplateColumns: `repeat(${Math.max(units.length, 1)}, minmax(0, 1fr))` }}
              >
                {units.map((unit) => {
                  const unitCabins = sortCabinsForPrint(genderCabins.filter((c) => c.unit === unit), gender, unit);
                  return (
                    <div key={unit} className="bunk-staff-sheet__unit-col">
                      <p className="bunk-staff-sheet__unit-label">{UNIT_LABEL[unit] ?? unit} {genderLabel}</p>
                      {unitCabins.map((cabin) => {
                        const staff = cabin.cabinStaffAssignments;
                        const cas = cabin.campers;
                        const wiped = staff.length > 0 && staff.every((a) => pulledStaffIds.has(a.staffId));
                        return (
                          <div key={cabin.id} className={`bunk-sheet__cabin-box bunk-staff-sheet__box${wiped ? " bunk-staff-sheet__box--wiped" : ""}`}>
                            <p className={`bunk-sheet__cabin-header${wiped ? " bunk-sheet__cabin-header--wiped" : ""}`}>{cabin.name} ({staff.length}{cas.length ? `+${cas.length}` : ""})</p>
                            {staff.length + cas.length > 0 ? (
                              <div className="bunk-staff-sheet__names">
                                {staff.map((a, i) => {
                                  const lg = isLifeguardStaff(a.staff);
                                  const pulled = pulledStaffIds.has(a.staffId);
                                  return (
                                    <div key={`s-${i}`} className={pulled ? "bunk-staff-sheet__name--pulled" : undefined}>
                                      {lg ? "*" : ""}{a.staff.firstName} {a.staff.lastName}{staffRoleSuffix(a.staff)}
                                    </div>
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

              {genderOutOfCabin.length > 0 ? (
                <div className="bunk-sheet__cabin-box bunk-staff-sheet__box" style={{ maxWidth: "3in", marginTop: "0.12in" }}>
                  <p className="bunk-sheet__cabin-header">OUT OF CABIN ({genderOutOfCabin.length})</p>
                  <div className="bunk-staff-sheet__names">
                    {genderOutOfCabin.map((listing, i) => {
                      const lg = isLifeguardStaff(listing.staff);
                      const pulled = pulledStaffIds.has(listing.staffId);
                      return (
                        <div key={`ooc-${i}`} className={pulled ? "bunk-staff-sheet__name--pulled" : undefined}>
                          {lg ? "*" : ""}{listing.staff.firstName} {listing.staff.lastName}{staffRoleSuffix(listing.staff)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <p className="bunk-sheet__footer">
                <s>struck through</s> = assigned to registration tables{reportLabel ? ` ("${reportLabel}")` : ""} &middot; dashed box = ALL staff at registration
                {anyLifeguard ? <> &middot; *lifeguard certified</> : null}
                {" "}&middot; Generated {generatedAt}
              </p>

              {genderCabins.length === 0 ? <p className="text-sm text-slate-500">No cabins for {genderLabel.toLowerCase()} yet.</p> : null}
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}
