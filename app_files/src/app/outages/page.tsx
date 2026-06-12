import { OutageReason, OutageStatus, OutageSubjectType, Period, RegistrationStatus, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge, Field, PageHeader, Panel, SectionHeader, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { readStringArray } from "@/lib/local-arrays";
import { PERIOD_LABEL, STAFF_PERIODS } from "@/lib/periods";
import { prisma } from "@/lib/prisma";
import { createOutage, resolveOutage } from "./actions";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

function label(value: string) {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function OutagesPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const session = await prisma.session.findFirst({ where: { active: true } });
  const scopedAreaId = user.role === UserRole.AREA_HEAD ? user.areaId : null;
  const [campers, staff, cabins, outages] = session
    ? await Promise.all([
        prisma.camper.findMany({ where: { sessionId: session.id, active: true }, include: { cabin: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
        prisma.staff.findMany({ where: { active: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
        prisma.cabin.findMany({ orderBy: [{ unit: "asc" }, { name: "asc" }] }),
        prisma.outage.findMany({
          where: { sessionId: session.id },
          include: { camper: { include: { cabin: true } }, staff: true, cabin: true, createdBy: true },
          orderBy: [{ status: "asc" }, { startDate: "desc" }]
        })
      ])
    : [[], [], [], []];

  const impacts = session ? await Promise.all(outages.map((outage) => outageImpact(outage, scopedAreaId))) : [];

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
            <form action={createOutage} className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Subject type">
                  <select className={inputClass} name="subjectType" defaultValue={OutageSubjectType.CAMPER}>
                    {Object.values(OutageSubjectType).map((type) => <option key={type} value={type}>{label(type)}</option>)}
                  </select>
                </Field>
                <Field label="Reason">
                  <select className={inputClass} name="reason" defaultValue={OutageReason.TRIP}>
                    {Object.values(OutageReason).map((reason) => <option key={reason} value={reason}>{label(reason)}</option>)}
                  </select>
                </Field>
                <Field label="Camper">
                  <select className={inputClass} name="camperId">
                    <option value="">None</option>
                    {campers.map((camper) => <option key={camper.id} value={camper.id}>{camper.lastName}, {camper.firstName} ({camper.cabin?.name ?? "No cabin"})</option>)}
                  </select>
                </Field>
                <Field label="Staff">
                  <select className={inputClass} name="staffId">
                    <option value="">None</option>
                    {staff.map((person) => <option key={person.id} value={person.id}>{person.lastName}, {person.firstName}</option>)}
                  </select>
                </Field>
                <Field label="Cabin">
                  <select className={inputClass} name="cabinId">
                    <option value="">None</option>
                    {cabins.map((cabin) => <option key={cabin.id} value={cabin.id}>{cabin.name}</option>)}
                  </select>
                </Field>
                <Field label="Manual trip / custom title">
                  <input className={inputClass} name="manualTitle" placeholder="Example: Unit 3 canoe trip" />
                </Field>
                <Field label="Start date">
                  <input className={inputClass} name="startDate" type="date" defaultValue={dateValue(new Date())} required />
                </Field>
                <Field label="End date">
                  <input className={inputClass} name="endDate" type="date" defaultValue={dateValue(new Date())} required />
                </Field>
              </div>
              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black">
                <input name="fullDay" type="checkbox" defaultChecked />
                Full day
              </label>
              <div>
                <p className="mb-2 text-sm font-black text-slate-700">Affected periods</p>
                <div className="flex flex-wrap gap-2">
                  {STAFF_PERIODS.map((period) => (
                    <label key={period} className="cursor-pointer">
                      <input className="peer sr-only" name="periods" type="checkbox" value={period} />
                      <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 peer-checked:border-lake-700 peer-checked:bg-lake-700 peer-checked:text-white">{PERIOD_LABEL[period]}</span>
                    </label>
                  ))}
                </div>
              </div>
              <Field label="Notes">
                <input className={inputClass} name="notes" />
              </Field>
              <button className={buttonClass} type="submit">Create outage</button>
            </form>
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
