import { OutageStatus, OutageSubjectType, Period, RegistrationStatus, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { Badge, PageHeader, Panel, SectionHeader, inputClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { readStringArray } from "@/lib/local-arrays";
import { PERIOD_LABEL } from "@/lib/periods";
import { prisma } from "@/lib/prisma";
import { resolveOutage } from "./actions";
import { OutageForm } from "./outage-form";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

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
  const [campers, staff, cabins, outages, areas] = session
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
        prisma.cabin.findMany({ orderBy: [{ unit: "asc" }, { name: "asc" }] }),
        prisma.outage.findMany({
          where: { sessionId: session.id },
          include: { camper: { include: { cabin: true } }, staff: true, cabin: true, createdBy: true },
          orderBy: [{ status: "asc" }, { startDate: "desc" }]
        }),
        prisma.area.findMany({ where: { active: true }, orderBy: { name: "asc" } })
      ])
    : [[], [], [], [], []];

  const impacts = session ? await Promise.all(outages.map((outage) => outageImpact(outage, scopedAreaId))) : [];
  const selectedDate = new Date(`${reportDate}T12:00:00`);
  const reportArea = selectedReportAreaId ? areas.find((area) => area.id === selectedReportAreaId) : null;
  const reportOutages = session
    ? await prisma.outage.findMany({
        where: { sessionId: session.id, status: OutageStatus.ACTIVE, startDate: { lte: selectedDate }, endDate: { gte: selectedDate } },
        include: { camper: { include: { cabin: true } }, staff: true, cabin: true, createdBy: true },
        orderBy: [{ subjectType: "asc" }, { startDate: "asc" }]
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
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <Panel>
            <SectionHeader title="Create Outage" detail="Periods are optional when the outage is not a full-day outage." />
            <OutageForm
              campers={campers.map((camper) => ({
                id: camper.id,
                name: `${camper.firstName} ${camper.lastName}`,
                cabinId: camper.cabinId,
                cabinName: camper.cabin?.name ?? "No cabin",
                unit: camper.unit
              }))}
              staff={staff.map((person) => ({
                id: person.id,
                name: `${person.firstName} ${person.lastName}`,
                area: person.primaryArea?.name ?? "No primary area"
              }))}
              cabins={cabins.map((cabin) => ({ id: cabin.id, name: cabin.name }))}
            />
          </Panel>

          <Panel>
            <SectionHeader title="Outage Impacts" detail={scopedAreaId ? "Showing only your area impacts." : "Executive Admin view shows all impacted areas."}>
              <Badge>{outages.filter((outage) => outage.status === OutageStatus.ACTIVE).length} active</Badge>
            </SectionHeader>
            <div className="grid gap-3">
              {outages.map((outage, index) => (
                <article key={outage.id} className="rounded-xl border border-slate-200 bg-white p-4">
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
                        {readStringArray(outage.periods).length ? ` • ${readStringArray(outage.periods).map((period) => PERIOD_LABEL[period as Period]).join(", ")}` : ""}
                      </p>
                      {outage.notes ? <p className="mt-2 text-sm text-slate-600">{outage.notes}</p> : null}
                    </div>
                    {outage.status === OutageStatus.ACTIVE ? (
                      <form action={resolveOutage}>
                        <input name="id" type="hidden" value={outage.id} />
                        <button className={secondaryButtonClass} type="submit">Resolve</button>
                      </form>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-2">
                    {impacts[index].length ? impacts[index].map((impact) => (
                      <div key={`${outage.id}-${impact.offeringId}`} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
                        <p className="font-black text-forest-900">{impact.period} • {impact.area} • {impact.activity}</p>
                        <p className="mt-1 text-slate-600">{impact.detail}</p>
                      </div>
                    )) : <p className="rounded-lg border border-dashed border-slate-200 p-3 text-sm font-semibold text-slate-500">No class impacts visible for this outage scope.</p>}
                  </div>
                </article>
              ))}
            </div>
          </Panel>
          <Panel className="xl:col-span-2">
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
                      <th className="border border-slate-300 p-2">Person / Group</th>
                      <th className="border border-slate-300 p-2">Reason</th>
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
                        <td className="border border-slate-300 p-2">{impact.period}</td>
                        <td className="border border-slate-300 p-2">{impact.area}</td>
                        <td className="border border-slate-300 p-2">{impact.activity}</td>
                        <td className="border border-slate-300 p-2">{impact.detail}</td>
                      </tr>
                    ))}
                    {!reportImpacts.length ? (
                      <tr><td className="border border-slate-300 p-3 text-center font-semibold text-slate-500" colSpan={6}>No matching outage impacts for this date and area.</td></tr>
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
                    {staffingRows.map(({ person, assignments }: { person: any; assignments: any }) => (
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

type OutageWithRelations = Awaited<ReturnType<typeof prisma.outage.findFirst>> & {
  camper?: { id: string; firstName: string; lastName: string; cabinId: string | null; cabin?: { name: string } | null } | null;
  staff?: { id: string; firstName: string; lastName: string } | null;
  cabin?: { id: string; name: string } | null;
};

function outageTitle(outage: OutageWithRelations) {
  if (outage.subjectType === OutageSubjectType.CAMPER && outage.camper) return `${outage.camper.firstName} ${outage.camper.lastName}`;
  if (outage.subjectType === OutageSubjectType.STAFF && outage.staff) return `${outage.staff.firstName} ${outage.staff.lastName}`;
  if (outage.subjectType === OutageSubjectType.CABIN && outage.cabin) return `Cabin ${outage.cabin.name}`;
  return outage.manualTitle || label(outage.subjectType);
}

async function outageImpact(outage: OutageWithRelations, areaId: string | null) {
  const periods = readStringArray(outage.periods) as Period[];
  const periodFilter = periods.length ? { period: { in: periods } } : {};
  const areaFilter = areaId ? { offering: { areaId } } : {};

  if (outage.subjectType === OutageSubjectType.CAMPER && outage.camperId) {
    const registrations = await prisma.registration.findMany({
      where: { camperId: outage.camperId, status: { in: activeRegistration }, ...periodFilter, ...areaFilter },
      include: { offering: { include: { area: true, activity: true } } }
    });
    return registrations.map((registration) => ({
      offeringId: registration.offeringId,
      period: PERIOD_LABEL[registration.period],
      area: registration.offering.area.name,
      activity: registration.offering.activity.name,
      detail: `${outage.camper?.firstName ?? "Camper"} is not expected.`
    }));
  }

  if (outage.subjectType === OutageSubjectType.STAFF && outage.staffId) {
    const assignments = await prisma.staffAssignment.findMany({
      where: { staffId: outage.staffId, ...periodFilter, offering: areaId ? { areaId } : undefined },
      include: { offering: { include: { area: true, activity: true } } }
    });
    return assignments.map((assignment) => ({
      offeringId: assignment.offeringId,
      period: PERIOD_LABEL[assignment.period],
      area: assignment.offering.area.name,
      activity: assignment.offering.activity.name,
      detail: `${outage.staff?.firstName ?? "Staff"} is assigned here and may need coverage.`
    }));
  }

  if (outage.subjectType === OutageSubjectType.CABIN && outage.cabinId) {
    const registrations = await prisma.registration.findMany({
      where: { camper: { cabinId: outage.cabinId }, status: { in: activeRegistration }, ...periodFilter, ...areaFilter },
      include: { camper: true, offering: { include: { area: true, activity: true } } }
    });
    return registrations.map((registration) => ({
      offeringId: registration.offeringId,
      period: PERIOD_LABEL[registration.period],
      area: registration.offering.area.name,
      activity: registration.offering.activity.name,
      detail: `${registration.camper.firstName} ${registration.camper.lastName} from ${outage.cabin?.name ?? "cabin"} is not expected.`
    }));
  }

  return [];
}
