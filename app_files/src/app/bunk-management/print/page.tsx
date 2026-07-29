import { Gender, UserRole, WeekBlock } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { requireBunkManagementAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isLifeguardStaff, staffRoleSuffix } from "@/lib/bunk-staff-tags";
import { sortCabinsForPrint } from "@/lib/cabin-print-order";
import { formatGeneratedAt } from "@/lib/camp-time";
import { departureNote } from "@/lib/week-enrollment";

const UNIT_LABEL: Record<string, string> = {
  UNIT1: "Unit 1",
  UNIT2: "Unit 2",
  UNIT3: "Unit 3",
  UNIT4: "Unit 4"
};

export default async function BunkManagementPrintPage({
  searchParams
}: {
  searchParams?: Promise<{ gender?: string; weeks?: string }>;
}) {
  const user = await requireBunkManagementAccess("read");
  const params = searchParams ? await searchParams : {};
  const isExecAdmin = user.role === UserRole.EXECUTIVE_ADMIN;

  // WEEK 7 PREVIEW MODE (?weeks=wk7). Off by default, so the sheet every
  // other caller prints is byte-for-byte what it was. When on, campers who
  // leave before the final week are dropped from the cabin lists so the
  // final-week sheets can be prepared while the two-weekers are still here.
  // Nothing is written and no camper record changes -- this is a read-time
  // filter on one page only.
  const wk7Only = params.weeks === "wk7";

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

  const allCabins = await prisma.cabin.findMany({
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
          sessionDesignations: { select: { label: true }, orderBy: { label: "asc" } },
          // sessionId scope matches rosters/page.tsx, area-staffing.ts and
          // athletics-assignments.ts: unscoped, a returning camper's rows from
          // an earlier session feed the last-week-here calculation and they'd
          // be dropped from a sheet they belong on. Always selected (not just
          // in wk7 mode) so the two query shapes stay identical -- one enum
          // column, at most four rows per camper.
          weekEnrollments: { where: { sessionId: session.id }, select: { weekBlock: true }, orderBy: { weekBlock: "asc" as const } }
        },
        orderBy: [{ counselorAssistant: "asc" }, { lastName: "asc" }]
      },
      cabinStaffAssignments: {
        // staff.active filter: departed staff must not print on bunk sheets.
        where: { sessionId: session.id, staff: { active: true } },
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

  // A camper "stays through Week 7" when departureNote() returns null -- the
  // same test the area sheets and roster footers use, so this sheet can never
  // disagree with them. Note the shared convention: a camper carrying NO
  // current-session week rows returns null and is treated as STAYING. That is
  // deliberate and it's the safe direction -- an unclassified camper prints on
  // the Week 7 sheet rather than silently vanishing from a cabin.
  //
  // CAs are Camper records, so they're filtered by the same rule. STAFF are
  // untouched: cabin staff assignments carry no week blocks, so every cabin
  // keeps its full staff list and its headcount line recomputes from whoever
  // is left. Empty cabins still print -- an emptied cabin is information.
  const staysThroughWk7 = (camper: { weekEnrollments: { weekBlock: WeekBlock }[] }) =>
    departureNote(camper.weekEnrollments) === null;

  const cabins = wk7Only
    ? allCabins.map((cabin) => ({ ...cabin, campers: cabin.campers.filter(staysThroughWk7) }))
    : allCabins;

  const departingCount = wk7Only
    ? allCabins.reduce((total, cabin) => total + cabin.campers.filter((c) => !staysThroughWk7(c)).length, 0)
    : 0;

  const units = Array.from(new Set(cabins.map((c) => c.unit))).sort();

  // Hand-picked OUT OF CABIN staff (see /bunk-management/out-of-cabin),
  // cabin-sheet flag only. Same render-time double-print guard as the
  // staff sheet: anyone since assigned to a cabin is excluded here.
  // SIDE RULE: boys print with the boys, girls with the girls — a listing
  // only appears on the sheet whose side matches it. Staff records carry
  // no gender field, so the listing's side IS the gender signal; a listing
  // with no side set can't be placed and is held out of print entirely,
  // surfaced in the screen-only warning banner below instead of being
  // mixed onto both sides' sheets.
  const outOfCabinListings = await prisma.outOfCabinListing.findMany({
    where: {
      sessionId: session.id,
      showOnCabinSheet: true,
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
  // This document is single-gender: only this side's listings print on it.
  const outOfCabinStaff = outOfCabinListings.filter((listing) => listing.side === gender);
  const unsidedOutOfCabin = outOfCabinListings.filter((listing) => listing.side === null);

  // The late-arrival asterisk and its footer legend are driven by the
  // existing CamperSessionDesignation label system (matching an existing
  // designation whose label reads "late arrival", case-insensitive) --
  // there's no dedicated field for this, so this reads the same admin-
  // entered designations everything else in the app already uses. The
  // legend line only appears on a page if at least one camper on it is
  // actually flagged that way, same as the original sheet.
  const isLateArrival = (designations: { label: string }[]) => designations.some((d) => /late arrival/i.test(d.label));

  const generatedAt = formatGeneratedAt();

  // Both toggles have to preserve the other's state, or switching sides in
  // Week 7 mode would silently kick you back to the full sheet.
  const genderHref = (target: "MALE" | "FEMALE") => {
    const qs = new URLSearchParams({ gender: target });
    if (wk7Only) qs.set("weeks", "wk7");
    return `?${qs.toString()}`;
  };
  const weeksHref = (target: "wk7" | null) => {
    const qs = new URLSearchParams();
    if (isExecAdmin) qs.set("gender", gender === Gender.FEMALE ? "FEMALE" : "MALE");
    if (target) qs.set("weeks", target);
    const query = qs.toString();
    return query ? `?${query}` : "?";
  };

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
              <a href={genderHref("MALE")} className={`rounded-lg border px-3 py-1 text-xs font-black ${gender === "MALE" ? "border-lake-500 bg-lake-50" : "border-slate-200 bg-white"}`}>Boys</a>
              <a href={genderHref("FEMALE")} className={`rounded-lg border px-3 py-1 text-xs font-black ${gender === "FEMALE" ? "border-lake-500 bg-lake-50" : "border-slate-200 bg-white"}`}>Girls</a>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <a href={weeksHref(null)} className={`rounded-lg border px-3 py-1 text-xs font-black ${!wk7Only ? "border-lake-500 bg-lake-50" : "border-slate-200 bg-white"}`}>All campers</a>
            <a href={weeksHref("wk7")} className={`rounded-lg border px-3 py-1 text-xs font-black ${wk7Only ? "border-lake-500 bg-lake-50" : "border-slate-200 bg-white"}`}>Week 7 only</a>
          </div>
          <a href="/bunk-management/print-staff" className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-black">Staff-only sheet</a>
          <PrintButton label="Print / Save PDF" />
        </PageHeader>
        {wk7Only ? (
          // Screen-only. Whoever prints this needs to know at a glance that
          // the sheet is a forecast, not the current cabin state.
          <div className="mb-4 rounded-lg border border-lake-300 bg-lake-50 p-4 text-sm text-slate-800">
            <p className="font-black">Week 7 preview — {departingCount} departing {departingCount === 1 ? "camper is" : "campers are"} hidden.</p>
            <p className="mt-1">
              Campers whose last week block is before Week 7 are left off these sheets. Nothing has been changed or removed —
              they are still in their cabins, and the <a className="font-black underline" href={weeksHref(null)}>All campers</a> sheet still shows everyone.
              Staff assignments are untouched; headcounts recalculate from the campers shown.
            </p>
          </div>
        ) : null}
        {unsidedOutOfCabin.length > 0 ? (
          // Screen-only (no-print): the paper sheets stay clean, but the
          // person printing can't miss that someone is being held out.
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
        {units.map((unit, unitIndex) => {
          // Print order is age order, not alphabetical -- see
          // cabin-print-order.ts (fixes B10-before-B7 and puts G4 first
          // in Unit 2 boys).
          const unitCabins = sortCabinsForPrint(cabins.filter((c) => c.unit === unit), gender, unit);
          const anyLateArrival = unitCabins.some((c) => c.campers.some((camper) => isLateArrival(camper.sessionDesignations)));
          const isLastUnit = unitIndex === units.length - 1;
          // OUT OF CABIN prints once per gender document, on the last
          // unit's page (no extra page). Its lifeguards feed that page's
          // legend check.
          const showOutOfCabin = isLastUnit && outOfCabinStaff.length > 0;
          const anyLifeguard =
            unitCabins.some((c) => c.cabinStaffAssignments.some((a) => isLifeguardStaff(a.staff))) ||
            (showOutOfCabin && outOfCabinStaff.some((listing) => isLifeguardStaff(listing.staff)));

          // .bunk-sheet__cabin = the atomic print unit (name box + camper
          // table together). In print CSS it becomes an inline-block, which
          // browsers treat as monolithic: it can NEVER be sliced across a
          // page boundary -- if it doesn't fit, the whole cabin moves to
          // the next page.
          const renderCabin = (cabin: (typeof unitCabins)[number]) => {
            const regularCampers = cabin.campers.filter((c) => !c.counselorAssistant);
            const cas = cabin.campers.filter((c) => c.counselorAssistant);
            const staff = cabin.cabinStaffAssignments;
            const total = regularCampers.length + staff.length + cas.length;
            const parts = [regularCampers.length, staff.length];
            if (cas.length > 0) parts.push(cas.length);
            return (
              <div key={cabin.id} className="bunk-sheet__cabin">
                <div className="bunk-sheet__cabin-box">
                  <p className="bunk-sheet__cabin-header">{cabin.name} ({parts.join("+")}={total})</p>
                  {staff.length > 0 || cas.length > 0 ? (
                    <div className="bunk-sheet__staff-cols">
                      <div>
                        {staff.map((a, i) => {
                          const lg = isLifeguardStaff(a.staff);
                          return (
                            <div key={i}>{lg ? "*" : ""}{a.staff.firstName} {a.staff.lastName}{staffRoleSuffix(a.staff)}</div>
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
          };

          // The unit title + the FIRST ROW of cabins are welded into one
          // monolithic .bunk-sheet__lead inline-block for print. Without
          // this, any unit taller than one page (e.g. Girls Unit 3 with
          // G37's 21 campers) strands the "Girls Unit 3 ..." headline
          // alone on a page while every cabin moves to the next -- Chrome
          // and Safari both do it. An inline-block is unsliceable in every
          // engine (same trick the cabins themselves use), so the title
          // can never separate from its first two cabins. On screen the
          // wrapper is display:contents, so the grid layout is unchanged.
          const leadCabins = unitCabins.slice(0, 2);
          const restCabins = unitCabins.slice(2);

          // FIT-TO-ONE-PAGE: every unit must land on exactly one page no
          // matter how big its cabins get. Same zoom mechanism the
          // staff-only sheet uses, but computed per unit from the live
          // roster instead of hard-coded. The height model was fitted
          // against headless-Chromium measurements of the real Q3 print
          // CSS (letter portrait, 0.35in margins, cabins 2-up at 48%):
          //   cabin = 0.41in chrome + 0.206in/staff line + 0.23in/camper
          //           row + 0.20in per row whose text wraps to 2 lines
          //           (first+last+designation > 31 chars at full width)
          // and the fit was exact to <0.01in across all 26 cabins. Zoom
          // only ever shrinks (min with 1), and shrinking widens the
          // logical layout, which reduces wrapping -- so the estimate is
          // an upper bound and the fit direction is always safe. The
          // 10.0in budget (vs 10.3in usable) is the safety margin for
          // font-metric drift across machines; the welded lead above is
          // the fallback if a unit ever still overflows.
          const estimateCabinHeightIn = (cabin: (typeof unitCabins)[number]) => {
            const regular = cabin.campers.filter((c) => !c.counselorAssistant);
            const casCount = cabin.campers.filter((c) => c.counselorAssistant).length;
            const staffList = cabin.cabinStaffAssignments;
            const staffLines = Math.max(staffList.length, casCount, 1);
            const staffWraps = staffList.filter(
              (a) => (a.staff.firstName.length + a.staff.lastName.length + staffRoleSuffix(a.staff).length) > 20
            ).length;
            const camperWraps = regular.filter(
              (c) => c.firstName.length + c.lastName.length + (c.sessionDesignations[0]?.label ?? "").length > 31
            ).length;
            return 0.41 + staffLines * 0.206 + staffWraps * 0.19 + regular.length * 0.23 + camperWraps * 0.2;
          };
          let bodyHeightIn = 0;
          for (let i = 0; i < unitCabins.length; i += 2) {
            const left = estimateCabinHeightIn(unitCabins[i]);
            const right = i + 1 < unitCabins.length ? estimateCabinHeightIn(unitCabins[i + 1]) : 0;
            bodyHeightIn += Math.max(left, right) + 0.09; // + cabin bottom margin
          }
          const outOfCabinHeightIn = showOutOfCabin ? 0.5 + outOfCabinStaff.length * 0.206 : 0;
          const totalHeightIn = 0.38 /* title */ + bodyHeightIn + 0.3 /* footer */ + outOfCabinHeightIn;
          const unitZoom = Math.min(1, 10.0 / totalHeightIn);

          return (
            <section
              key={unit}
              className="bunk-sheet-page"
              style={{ ["--unit-zoom" as string]: String(unitZoom) } as React.CSSProperties}
            >
              <div className="bunk-sheet__cabin-grid">
                <div className="bunk-sheet__lead">
                  <p className="bunk-sheet__unit-title">{genderLabel} {UNIT_LABEL[unit]} {session.cycle} {session.year}{wk7Only ? " \u00b7 WEEK 7" : ""}</p>
                  {leadCabins.map(renderCabin)}
                </div>
                {restCabins.map(renderCabin)}
              </div>

              {/* .bunk-sheet__page-end keeps the OUT OF CABIN box and the
                  footer legend welded together as one monolithic block in
                  print: the footer can never be orphaned onto a page by
                  itself -- if the pair doesn't fit, they move together. */}
              <div className="bunk-sheet__page-end">
                {showOutOfCabin ? (
                  <div className="bunk-sheet__cabin-box" style={{ maxWidth: "3in", marginTop: "6px" }}>
                  <p className="bunk-sheet__cabin-header">OUT OF CABIN ({outOfCabinStaff.length})</p>
                  <div className="bunk-sheet__staff-cols">
                    <div>
                      {outOfCabinStaff.map((listing, i) => {
                        const lg = isLifeguardStaff(listing.staff);
                        return (
                          <div key={i}>{lg ? "*" : ""}{listing.staff.firstName} {listing.staff.lastName}{staffRoleSuffix(listing.staff)}</div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                ) : null}

                <p className="bunk-sheet__footer">
                  {wk7Only ? <><strong>WEEK 7 ONLY &mdash; departing campers not shown</strong> &middot; </> : null}
                  {anyLateArrival ? <>*late arrival (campers) &middot; </> : null}
                  {anyLifeguard ? <>*lifeguard certified (staff) &middot; </> : null}
                  Generated from Bunk Management, {generatedAt}
                </p>
              </div>
            </section>
          );
        })}
        {units.length === 0 ? <p className="text-sm text-slate-500">No cabins for {genderLabel.toLowerCase()} yet.</p> : null}
      </div>
    </AppShell>
  );
}
