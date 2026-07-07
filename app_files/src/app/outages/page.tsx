import { OutageStatus, Period, Prisma, RegistrationStatus, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { PrintButton } from "@/components/print-button";
import { Badge, PageHeader, Panel, SectionHeader, dangerButtonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { readStringArray } from "@/lib/local-arrays";
import { PERIOD_LABEL } from "@/lib/periods";
import { prisma } from "@/lib/prisma";
import { deleteOutage, migrateLegacyOutages, resolveOutage, reopenOutage } from "./actions";
import { OutageForm } from "./outage-form";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

const outageInclude = {
  campers: { include: { camper: { include: { cabin: true } } } },
  staffLinks: { include: { staff: true } },
  camper: { include: { cabin: true } },
  staff: true,
  cabin: true,
  createdBy: true
} as const;

function label(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

type OutagesSearchParams = {
  reportDate?: string | string[];
  reportAreaId?: string | string[];
  reportType?: string | string[];
  pastQuery?: string | string[];
  pastFrom?: string | string[];
  pastTo?: string | string[];
  pastSort?: string | string[];
};

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function OutagesPage({ searchParams }: { searchParams?: Promise<OutagesSearchParams> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const params = searchParams ? await searchParams : {};
  const session = await prisma.session.findFirst({ where: { active: true } });
  const scopedAreaId = user.role === UserRole.AREA_HEAD ? user.areaId : null;
  const reportDate = firstParam(params.reportDate) || dateValue(new Date());
  const selectedReportType = firstParam(params.reportType) === "staffing" ? "staffing" : "missing";
  const requestedAreaId = firstParam(params.reportAreaId);
  const selectedReportAreaId = scopedAreaId ?? (requestedAreaId === "ALL" ? "" : requestedAreaId);

  const pastQuery = firstParam(params.pastQuery).trim();
  const pastFrom = firstParam(params.pastFrom);
  const pastTo = firstParam(params.pastTo);
  const pastSort = firstParam(params.pastSort) === "oldest" ? "oldest" : "newest";

  const [campers, staff, allStaff, cabins, activeOutages, pastOutagesRaw, areas, legacyCandidateCount] = session
    ? await Promise.all([
        prisma.camper.findMany({ where: { sessionId: session.id, active: true }, include: { cabin: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
        prisma.staff.findMany({
          where: { active: true, screamEligible: true },
          include: {
            primaryArea: true,
            secondaryAreas: { orderBy: { name: "asc" } },
            assignments: {
              where: { sessionId: session.id },
              include: { offering: { include: { area: true, activity: true } } },
              orderBy: [{ period: "asc" }]
            }
          },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
        }),
        // Unrestricted staff list for the outage form's picker -- anyone
        // active in Staff Management, regardless of the scream-eligible
        // toggle (kitchen staff, execs, unit heads not on the board, etc.
        // can all be added to a trip or infirmary visit).
        prisma.staff.findMany({
          where: { active: true },
          include: { primaryArea: true },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
        }),
        prisma.cabin.findMany({ orderBy: [{ unit: "asc" }, { name: "asc" }] }),
        prisma.outage.findMany({
          where: { sessionId: session.id, status: OutageStatus.ACTIVE },
          include: outageInclude,
          orderBy: [{ startDate: "desc" }]
        }),
        prisma.outage.findMany({
          where: {
            sessionId: session.id,
            status: OutageStatus.RESOLVED,
            ...(pastFrom ? { startDate: { gte: new Date(`${pastFrom}T00:00:00`) } } : {}),
            ...(pastTo ? { endDate: { lte: new Date(`${pastTo}T23:59:59`) } } : {})
          },
          include: outageInclude,
          orderBy: [{ startDate: pastSort === "oldest" ? "asc" : "desc" }]
        }),
        prisma.area.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
        prisma.outage.count({ where: { sessionId: session.id, subjectType: { not: null }, campers: { none: {} }, staffLinks: { none: {} } } })
      ])
    : [[], [], [], [], [], [], [], 0];

  const pastOutages = pastQuery
    ? pastOutagesRaw.filter((outage) => outageSearchText(outage).includes(pastQuery.toLowerCase()))
    : pastOutagesRaw;

  const activeImpacts = session ? await Promise.all(activeOutages.map((outage) => outageImpact(outage, scopedAreaId))) : [];
  const selectedDate = new Date(`${reportDate}T12:00:00`);
  const reportArea = selectedReportAreaId ? areas.find((area) => area.id === selectedReportAreaId) : null;
  const reportOutages = session
    ? await prisma.outage.findMany({
        where: { sessionId: session.id, status: OutageStatus.ACTIVE, startDate: { lte: selectedDate }, endDate: { gte: selectedDate } },
        include: outageInclude,
        orderBy: [{ startDate: "asc" }]
      })
    : [];
  const reportImpacts = session
    ? (await Promise.all(reportOutages.map(async (outage) => ({ outage, impacts: await outageImpact(outage, selectedReportAreaId || null) })))).flatMap(({ outage, impacts }) =>
        impacts.map((impact) => ({ outage, ...impact }))
      )
    : [];
  const staffingRows = staff
    .map((person) => {
      const assignments = person.assignments.filter((assignment) => !selectedReportAreaId || assignment.offering.areaId === selectedReportAreaId);
      const areaMatch =
        !selectedReportAreaId ||
        person.primaryAreaId === selectedReportAreaId ||
        person.secondaryAreas.some((area) => area.id === selectedReportAreaId) ||
        assignments.length > 0;
      return { person, assignments, areaMatch };
    })
    .filter((row) => row.areaMatch);
  const generatedAt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date());

  return (
    <AppShell user={user}>
      <PageHeader
        title="Outages"
        eyebrow={session?.name ?? "No active session"}
        description="Track trips, infirmary, off-camp, vacation, and custom absences without deleting registrations or assignments."
      />

      {!session ? (
        <Panel><p className="font-bold text-amber-800">No active session is selected.</p></Panel>
      ) : (
        <div className="grid gap-6">
          {legacyCandidateCount > 0 ? (
            <Panel className="border-amber-300 bg-amber-50">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-black text-amber-900">{legacyCandidateCount} outage{legacyCandidateCount === 1 ? "" : "s"} from before the multi-camper redesign need{legacyCandidateCount === 1 ? "s" : ""} a one-time migration.</p>
                  <p className="text-sm font-semibold text-amber-800">This backfills the new camper/staff lists from the old single-subject records. Safe to run any time, and safe to run more than once.</p>
                </div>
                <form action={migrateLegacyOutages}>
                  <button className={secondaryButtonClass} type="submit">Migrate legacy records</button>
                </form>
              </div>
            </Panel>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <Panel>
              <SectionHeader title="Create Outage" detail="Add any mix of campers and staff — from one cabin, several cabins, or none at all." />
              <OutageForm
                campers={campers.map((camper) => ({
                  id: camper.id,
                  name: `${camper.firstName} ${camper.lastName}`,
                  cabinId: camper.cabinId,
                  cabinName: camper.cabin?.name ?? "No cabin",
                  unit: camper.unit
                }))}
                staff={allStaff.map((person) => ({
                  id: person.id,
                  name: `${person.firstName} ${person.lastName}`,
                  area: person.primaryArea?.name ?? "No primary area"
                }))}
                cabins={cabins.map((cabin) => ({ id: cabin.id, name: cabin.name }))}
              />
            </Panel>

            <Panel>
              <SectionHeader title="Active Outages" detail={scopedAreaId ? "Showing only your area impacts." : "Executive Admin view shows all impacted areas."}>
                <Badge>{activeOutages.length} active</Badge>
              </SectionHeader>
              <div className="grid gap-3">
                {activeOutages.map((outage, index) => (
                  <OutageCard key={outage.id} outage={outage} impacts={activeImpacts[index]} action={{ label: "Resolve", handler: resolveOutage }} />
                ))}
                {!activeOutages.length ? (
                  <p className="rounded-lg border border-dashed border-slate-200 p-3 text-sm font-semibold text-slate-500">No active outages right now.</p>
                ) : null}
              </div>
            </Panel>
          </div>

          <Panel>
            <SectionHeader title="Past Outages" detail="Resolved outages, searchable and sortable by date." />
            <form className="no-print mb-4 grid gap-3 md:grid-cols-4" method="get">
              <label className="grid gap-1 text-sm font-black text-slate-700 md:col-span-2">
                Search
                <input className={inputClass} name="pastQuery" placeholder="Camper, staff, location, notes..." defaultValue={pastQuery} />
              </label>
              <label className="grid gap-1 text-sm font-black text-slate-700">
                From
                <input className={inputClass} name="pastFrom" type="date" defaultValue={pastFrom} />
              </label>
              <label className="grid gap-1 text-sm font-black text-slate-700">
                To
                <input className={inputClass} name="pastTo" type="date" defaultValue={pastTo} />
              </label>
              <label className="grid gap-1 text-sm font-black text-slate-700">
                Sort
                <select className={inputClass} name="pastSort" defaultValue={pastSort}>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </label>
              <div className="flex items-end">
                <button className={secondaryButtonClass} type="submit">Apply filters</button>
              </div>
            </form>
            <div className="grid gap-3">
              {pastOutages.map((outage) => (
                <OutageCard key={outage.id} outage={outage} impacts={[]} action={{ label: "Reopen", handler: reopenOutage }} showResolvedDate />
              ))}
              {!pastOutages.length ? (
                <p className="rounded-lg border border-dashed border-slate-200 p-3 text-sm font-semibold text-slate-500">No past outages match these filters.</p>
              ) : null}
            </div>
          </Panel>

          <Panel>
            <SectionHeader title="Printable Reports" detail="Filter by date, area, and report type.">
              <PrintButton label="Print report" />
            </SectionHeader>
            <form className="no-print mb-5 grid gap-3 md:grid-cols-4" method="get">
              <label className="grid gap-1 text-sm font-black text-slate-700">
                Date
                <input className={inputClass} name="reportDate" type="date" defaultValue={reportDate} />
              </label>
              <label className="grid gap-1 text-sm font-black text-slate-700">
                Area
                <select className={inputClass} name="reportAreaId" defaultValue={selectedReportAreaId || "ALL"} disabled={Boolean(scopedAreaId)}>
                  <option value="ALL">All Areas</option>
                  {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-black text-slate-700">
                Report type
                <select className={inputClass} name="reportType" defaultValue={selectedReportType}>
                  <option value="missing">Missing kids/classes</option>
                  <option value="staffing">Staffing by area</option>
                </select>
              </label>
              <div className="flex items-end">
                <button className={secondaryButtonClass} type="submit">Apply report filters</button>
              </div>
            </form>

            <section className="outage-report-print rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Camp Walden Outages</p>
                  <h2 className="text-2xl font-black text-forest-900">{selectedReportType === "staffing" ? "Staffing Report by Area" : "Missing Kids / Classes"}</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-600">Date: {reportDate} • Area: {reportArea?.name ?? "All Areas"}</p>
                </div>
                <p className="text-xs font-semibold text-slate-500">Generated {generatedAt}</p>
              </div>

              {selectedReportType === "missing" ? (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-left">
                      <th className="border border-slate-300 p-2">Person / Trip</th>
                      <th className="border border-slate-300 p-2">Reason</th>
                      <th className="border border-slate-300 p-2">Location</th>
                      <th className="border border-slate-300 p-2">Period</th>
                      <th className="border border-slate-300 p-2">Area</th>
                      <th className="border border-slate-300 p-2">Class</th>
                      <th className="border border-slate-300 p-2">Impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportImpacts.map((impact) => (
                      <tr key={`${impact.outage.id}-${impact.offeringId}`}>
                        <td className="border border-slate-300 p-2 font-bold">{outageTitle(impact.outage)}</td>
                        <td className="border border-slate-300 p-2">{label(impact.outage.reason)}</td>
                        <td className="border border-slate-300 p-2">{impact.outage.location ?? "—"}</td>
                        <td className="border border-slate-300 p-2">{impact.period}</td>
                        <td className="border border-slate-300 p-2">{impact.area}</td>
                        <td className="border border-slate-300 p-2">{impact.activity}</td>
                        <td className="border border-slate-300 p-2">{impact.detail}</td>
                      </tr>
                    ))}
                    {!reportImpacts.length ? (
                      <tr><td className="border border-slate-300 p-3 text-center font-semibold text-slate-500" colSpan={7}>No matching outage impacts for this date and area.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-left">
                      <th className="border border-slate-300 p-2">Staff</th>
                      <th className="border border-slate-300 p-2">Primary area</th>
                      <th className="border border-slate-300 p-2">Secondary areas</th>
                      <th className="border border-slate-300 p-2">Classes taught</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffingRows.map(({ person, assignments }) => (
                      <tr key={person.id}>
                        <td className="border border-slate-300 p-2 font-bold">{person.firstName} {person.lastName}</td>
                        <td className="border border-slate-300 p-2">{person.primaryArea?.name ?? "No primary area"}</td>
                        <td className="border border-slate-300 p-2">{person.secondaryAreas.map((area) => area.name).join(", ") || "None"}</td>
                        <td className="border border-slate-300 p-2">
                          {assignments.length
                            ? assignments.map((assignment) => `${PERIOD_LABEL[assignment.period]}: ${assignment.offering.area.name} - ${assignment.offering.activity.name}`).join("; ")
                            : "No classes assigned in selected area"}
                        </td>
                      </tr>
                    ))}
                    {!staffingRows.length ? (
                      <tr><td className="border border-slate-300 p-3 text-center font-semibold text-slate-500" colSpan={4}>No matching staff for this area.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              )}
            </section>
          </Panel>
        </div>
      )}
    </AppShell>
  );
}

type OutageWithRelations = Prisma.OutageGetPayload<{ include: typeof outageInclude }>;

function participantCamperNames(outage: OutageWithRelations): string[] {
  if (!outage) return [];
  if (outage.campers?.length) return outage.campers.map((link) => `${link.camper.firstName} ${link.camper.lastName}`);
  if (outage.camper) return [`${outage.camper.firstName} ${outage.camper.lastName}`];
  return [];
}

function participantStaffNames(outage: OutageWithRelations): string[] {
  if (!outage) return [];
  if (outage.staffLinks?.length) return outage.staffLinks.map((link) => `${link.staff.firstName} ${link.staff.lastName}`);
  if (outage.staff) return [`${outage.staff.firstName} ${outage.staff.lastName}`];
  return [];
}

function outageTitle(outage: OutageWithRelations) {
  if (!outage) return "Outage";
  if (outage.manualTitle) return outage.manualTitle;
  const names = [...participantCamperNames(outage), ...participantStaffNames(outage)];
  if (!names.length) {
    if (outage.subjectType === "CABIN" && outage.cabin) return `Cabin ${outage.cabin.name} (needs migration)`;
    return label(outage.subjectType ?? "Outage");
  }
  if (names.length <= 2) return names.join(" & ");
  return `${names[0]}, ${names[1]} +${names.length - 2} more`;
}

function outageSearchText(outage: OutageWithRelations): string {
  if (!outage) return "";
  return [
    outage.manualTitle,
    outage.location,
    outage.notes,
    label(outage.reason),
    ...participantCamperNames(outage),
    ...participantStaffNames(outage)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

async function outageImpact(outage: OutageWithRelations, areaId: string | null) {
  if (!outage) return [];
  const periods = readStringArray(outage.periods) as Period[];
  const periodFilter = periods.length ? { period: { in: periods } } : {};
  const areaFilter = areaId ? { offering: { areaId } } : {};

  const camperIds = outage.campers?.length ? outage.campers.map((link) => link.camperId) : outage.camperId ? [outage.camperId] : [];
  const staffIds = outage.staffLinks?.length ? outage.staffLinks.map((link) => link.staffId) : outage.staffId ? [outage.staffId] : [];

  const impacts: { offeringId: string; period: string; area: string; activity: string; detail: string }[] = [];

  if (camperIds.length) {
    const registrations = await prisma.registration.findMany({
      where: { camperId: { in: camperIds }, status: { in: activeRegistration }, ...periodFilter, ...areaFilter },
      include: { camper: true, offering: { include: { area: true, activity: true } } }
    });
    impacts.push(
      ...registrations.map((registration) => ({
        offeringId: registration.offeringId,
        period: PERIOD_LABEL[registration.period],
        area: registration.offering.area.name,
        activity: registration.offering.activity.name,
        detail: `${registration.camper.firstName} ${registration.camper.lastName} is not expected.`
      }))
    );
  }

  if (staffIds.length) {
    const assignments = await prisma.staffAssignment.findMany({
      where: { staffId: { in: staffIds }, ...periodFilter, offering: areaId ? { areaId } : undefined },
      include: { staff: true, offering: { include: { area: true, activity: true } } }
    });
    impacts.push(
      ...assignments.map((assignment) => ({
        offeringId: assignment.offeringId,
        period: PERIOD_LABEL[assignment.period],
        area: assignment.offering.area.name,
        activity: assignment.offering.activity.name,
        detail: `${assignment.staff.firstName} ${assignment.staff.lastName} is assigned here and may need coverage.`
      }))
    );
  }

  // Legacy cabin-level outage not yet migrated -- computed dynamically
  // against the current roster since no per-person snapshot exists yet.
  if (!camperIds.length && outage.subjectType === "CABIN" && outage.cabinId) {
    const registrations = await prisma.registration.findMany({
      where: { camper: { cabinId: outage.cabinId }, status: { in: activeRegistration }, ...periodFilter, ...areaFilter },
      include: { camper: true, offering: { include: { area: true, activity: true } } }
    });
    impacts.push(
      ...registrations.map((registration) => ({
        offeringId: registration.offeringId,
        period: PERIOD_LABEL[registration.period],
        area: registration.offering.area.name,
        activity: registration.offering.activity.name,
        detail: `${registration.camper.firstName} ${registration.camper.lastName} from ${outage.cabin?.name ?? "cabin"} is not expected.`
      }))
    );
  }

  return impacts;
}

function OutageCard({
  outage,
  impacts,
  action,
  showResolvedDate
}: {
  outage: OutageWithRelations;
  impacts: { offeringId: string; period: string; area: string; activity: string; detail: string }[];
  action: { label: string; handler: (formData: FormData) => Promise<void> };
  showResolvedDate?: boolean;
}) {
  if (!outage) return null;
  const camperNames = participantCamperNames(outage);
  const staffNames = participantStaffNames(outage);
  const periods = readStringArray(outage.periods);

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={outage.status === OutageStatus.ACTIVE ? "amber" : "green"}>{label(outage.status)}</Badge>
            <Badge tone="blue">{label(outage.reason)}</Badge>
            <span className="text-sm font-black text-forest-900">{outageTitle(outage)}</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            {dateValue(outage.startDate)} to {dateValue(outage.endDate)}
            {outage.fullDay ? " • Full day" : ""}
            {periods.length ? ` • ${periods.map((period) => PERIOD_LABEL[period as Period]).join(", ")}` : ""}
            {outage.location ? ` • ${outage.location}` : ""}
          </p>
          {showResolvedDate && outage.resolvedAt ? (
            <p className="mt-1 text-xs font-semibold text-slate-400">Resolved {dateValue(outage.resolvedAt)}</p>
          ) : null}
          {(camperNames.length || staffNames.length) ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {camperNames.map((name) => <Badge key={`c-${name}`} tone="neutral">{name}</Badge>)}
              {staffNames.map((name, i) => (
                <Badge key={`s-${name}-${i}`} tone="blue">
                  {name}
                  {outage.staffLinks?.[i]?.phone ? ` • ${outage.staffLinks[i].phone}` : ""}
                </Badge>
              ))}
            </div>
          ) : null}
          {outage.notes ? <p className="mt-2 text-sm text-slate-600">{outage.notes}</p> : null}
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2">
          <form action={action.handler}>
            <input name="id" type="hidden" value={outage.id} />
            <button className={secondaryButtonClass} type="submit">{action.label}</button>
          </form>
          <form action={deleteOutage}>
            <input name="id" type="hidden" value={outage.id} />
            <ConfirmSubmitButton
              className={dangerButtonClass}
              confirmMessage={`Delete this outage${outageTitle(outage) !== "Outage" ? ` (${outageTitle(outage)})` : ""}? This cannot be undone.`}
              pendingLabel="Deleting…"
            >
              Delete
            </ConfirmSubmitButton>
          </form>
        </div>
      </div>
      {impacts.length ? (
        <div className="mt-3 grid gap-2">
          {impacts.map((impact) => (
            <div key={`${outage.id}-${impact.offeringId}`} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
              <p className="font-black text-forest-900">{impact.period} • {impact.area} • {impact.activity}</p>
              <p className="mt-1 text-slate-600">{impact.detail}</p>
            </div>
          ))}
        </div>
      ) : outage.status === OutageStatus.ACTIVE ? (
        <p className="mt-3 rounded-lg border border-dashed border-slate-200 p-3 text-sm font-semibold text-slate-500">No class impacts visible for this outage scope.</p>
      ) : null}
    </article>
  );
}
