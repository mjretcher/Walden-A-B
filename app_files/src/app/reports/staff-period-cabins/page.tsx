import type { Metadata } from "next";
import { Period, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_DISPLAY_LABEL, STAFF_PERIODS, TWILIGHT_PERIODS } from "@/lib/periods";
import { buildCaNameSet, isCaStaffRecord } from "@/lib/ca-staff-exclusion";
import { buildStaffCabinMap } from "@/lib/staff-cabin";

export const metadata: Metadata = { title: "Staff & Cabins by Period" };

type SearchParams = { period?: string | string[] };

function asArray(value?: string | string[]) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

/**
 * "Who's actually working period X, and which cabin are they in" — reads
 * the same Scream Session StaffAssignment data as Staff A/B Schedule
 * (that report's grid just isn't shaped to also carry a Cabin column
 * cleanly), cross-referenced with a staff member's cabin from either
 * source that can hold one -- see buildStaffCabinMap. Defaults to
 * Twilight (5A & 5B) since that's the immediate need, but works for any
 * period(s).
 *
 * Read-only: this only ever queries StaffAssignment, CabinStaffAssignment,
 * and Staff.cabinId, never writes to any of them.
 */
export default async function StaffPeriodCabinsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD, UserRole.COUNSELOR]);
  const params = searchParams ? await searchParams : {};
  const requested = asArray(params.period).filter((value): value is Period => (STAFF_PERIODS as string[]).includes(value));
  const selectedPeriods: Period[] = requested.length ? requested : TWILIGHT_PERIODS;

  const session = await prisma.session.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } });

  const assignments = session
    ? await prisma.staffAssignment.findMany({
        where: { sessionId: session.id, period: { in: selectedPeriods } },
        select: {
          id: true,
          period: true,
          staffId: true,
          staff: { select: { id: true, firstName: true, lastName: true } },
          offering: { select: { activity: { select: { name: true } }, area: { select: { name: true } } } }
        }
      })
    : [];

  const caNameSet = session ? await buildCaNameSet(session.id) : new Set<string>();
  const eligibleAssignments = assignments.filter((assignment) => !isCaStaffRecord(assignment.staff, caNameSet));

  const staffIds = Array.from(new Set(eligibleAssignments.map((assignment) => assignment.staffId)));
  // Merges the live Bunk Management board with the plain Staff.cabinId
  // field (CampMinder import / Staff Management profile page) -- see
  // buildStaffCabinMap for why both have to be checked.
  const cabinByStaffId = session ? await buildStaffCabinMap(session.id, staffIds) : new Map<string, string>();

  const byPeriod = new Map<Period, typeof eligibleAssignments>();
  for (const period of selectedPeriods) byPeriod.set(period, []);
  for (const assignment of eligibleAssignments) {
    const list = byPeriod.get(assignment.period) ?? [];
    list.push(assignment);
    byPeriod.set(assignment.period, list);
  }
  // Sorted cabin-first (no-cabin last) rather than name-first: the point of
  // pairing "working this period" with "which cabin" is usually to check
  // cabin coverage at a glance, so grouping by cabin reads better than an
  // alphabetical staff list would.
  for (const list of byPeriod.values()) {
    list.sort((a, b) => {
      const cabinA = cabinByStaffId.get(a.staffId) ?? "\uffff";
      const cabinB = cabinByStaffId.get(b.staffId) ?? "\uffff";
      const cabinCompare = cabinA.localeCompare(cabinB, undefined, { numeric: true });
      if (cabinCompare !== 0) return cabinCompare;
      return a.staff.lastName.localeCompare(b.staff.lastName);
    });
  }

  return (
    <AppShell user={user}>
      <PageHeader
        title="Staff & Cabins by Period"
        eyebrow="Reports"
        description="Who's actually working a given period (from Scream Session), and which cabin they're in (from Bunk Management). Defaults to Twilight — 5A & 5B — but pick any period(s). Export to Excel for a quick copy/paste list."
        backHref="/reports"
        backLabel="Back to Reports"
      />

      <form className="no-print mb-5 flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-soft" method="get">
        <fieldset>
          <legend className="mb-2 text-sm font-black text-forest-900">Periods</legend>
          <div className="flex flex-wrap gap-2">
            {STAFF_PERIODS.map((period) => (
              <label key={period} className="cursor-pointer">
                <input className="peer sr-only" defaultChecked={selectedPeriods.includes(period)} name="period" type="checkbox" value={period} />
                <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black peer-checked:border-forest-700 peer-checked:bg-forest-700 peer-checked:text-white">
                  {PERIOD_DISPLAY_LABEL[period]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-md bg-forest-800 px-4 py-2 text-sm font-semibold text-white" type="submit">Update</button>
          <a className={secondaryButtonClass} href="/reports/staff-period-cabins">Reset to Twilight</a>
          <PrintButton label="Print" />
          {user.role === UserRole.EXECUTIVE_ADMIN || user.role === UserRole.AREA_HEAD ? (
            <a
              className="rounded-md border border-forest-300 bg-forest-50 px-4 py-2 text-sm font-black text-forest-900 hover:bg-forest-100"
              href={`/api/exports/staff-period-cabins?${selectedPeriods.map((period) => `period=${period}`).join("&")}&format=xlsx`}
            >
              Export to Excel
            </a>
          ) : null}
        </div>
      </form>

      {!session ? (
        <p className="text-slate-500">No active session.</p>
      ) : (
        <div className="grid gap-6">
          {selectedPeriods.map((period) => {
            const list = byPeriod.get(period) ?? [];
            return (
              <section key={period} className="rounded-xl border border-slate-300 bg-white p-5 shadow-soft">
                <h2 className="mb-3 text-lg font-black text-forest-900">
                  Period {PERIOD_DISPLAY_LABEL[period]} — {list.length} staff working
                </h2>
                {list.length === 0 ? (
                  <p className="text-sm font-semibold text-slate-400">Nobody assigned this period.</p>
                ) : (
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b-2 border-slate-400 text-left">
                        <th className="p-2">Cabin</th>
                        <th className="p-2">Staff</th>
                        <th className="p-2">Assignment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((assignment) => (
                        <tr key={assignment.id} className="border-b border-slate-200">
                          <td className="p-2 font-black text-forest-900">{cabinByStaffId.get(assignment.staffId) ?? "—"}</td>
                          <td className="p-2 font-bold text-slate-800">{assignment.staff.firstName} {assignment.staff.lastName}</td>
                          <td className="p-2 text-slate-600">{assignment.offering.area.name} · {assignment.offering.activity.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
