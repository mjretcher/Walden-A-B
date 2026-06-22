import { AttendanceMark, CamperStatus, OutageStatus, RegistrationRole, RegistrationStatus } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge, PageHeader, StatCard, buttonClass, inputClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL } from "@/lib/periods";
import { saveAttendance } from "./actions";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

export default async function AttendancePage({ searchParams }: { searchParams?: Promise<{ offeringId?: string; date?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const session = await prisma.session.findFirst({ where: { active: true } });
  const offerings = session
    ? await prisma.activityOffering.findMany({
        where: { sessionId: session.id, active: true, visibleForCamperRegistration: true, area: { active: true }, activity: { active: true } },
        include: { area: true, activity: true },
        orderBy: [{ period: "asc" }, { area: { name: "asc" } }, { activity: { name: "asc" } }]
      })
    : [];

  const selectedOfferingId = params?.offeringId ?? offerings[0]?.id;
  const selectedOffering = offerings.find((offering) => offering.id === selectedOfferingId);
  const date = params?.date ?? new Date().toISOString().slice(0, 10);
  const registrations = selectedOfferingId
    ? await prisma.registration.findMany({
        where: { offeringId: selectedOfferingId, status: { in: activeRegistration } },
        include: {
          camper: { include: { cabin: true } },
          attendance: { where: { date: new Date(`${date}T12:00:00`) } }
        },
        orderBy: { camper: { lastName: "asc" } }
      })
    : [];
  const activeOutages = session
    ? await prisma.outage.findMany({
        where: {
          sessionId: session.id,
          status: OutageStatus.ACTIVE,
          startDate: { lte: new Date(`${date}T12:00:00`) },
          endDate: { gte: new Date(`${date}T12:00:00`) }
        },
        include: { camper: true, cabin: true, staff: true }
      })
    : [];

  const savedMarks = registrations.map((registration) => registration.attendance[0]?.mark).filter(Boolean);
  const presentCount = savedMarks.filter((mark) => mark === AttendanceMark.PRESENT).length;
  const absentCount = savedMarks.filter((mark) => mark === AttendanceMark.ABSENT).length;
  const notExpectedCount = savedMarks.filter((mark) => mark === AttendanceMark.NOT_EXPECTED).length;
  const unmarkedCount = registrations.length - savedMarks.length;

  return (
    <AppShell user={user}>
      <PageHeader title="Attendance" eyebrow="Expected vs missing status" />

      {!session ? (
        <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900">
          No active session is selected, so attendance cannot be taken yet.
        </div>
      ) : null}

      <form className="no-print mb-5 flex flex-wrap gap-3">
        <select className={inputClass} name="offeringId" defaultValue={selectedOfferingId}>
          {offerings.map((offering) => (
            <option key={offering.id} value={offering.id}>
              {PERIOD_LABEL[offering.period]} - {offering.area.name} - {offering.activity.name}
            </option>
          ))}
        </select>
        <input className={inputClass} name="date" type="date" defaultValue={date} />
        <button className={buttonClass}>Load roster</button>
      </form>

      {selectedOffering ? (
        <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Roster size" value={registrations.length} detail={`${PERIOD_LABEL[selectedOffering.period]} - ${selectedOffering.activity.name}`} />
          <StatCard label="Present" value={presentCount} tone="forest" detail="Saved present marks" />
          <StatCard label="Absent" value={absentCount} tone={absentCount ? "warning" : "forest"} detail="Saved absent marks" />
          <StatCard label="Unmarked" value={unmarkedCount + notExpectedCount} tone={unmarkedCount ? "warning" : "forest"} detail={`${unmarkedCount} not saved, ${notExpectedCount} not expected`} />
        </section>
      ) : null}

      {session && !offerings.length ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm font-medium text-slate-600 shadow-soft">
          No active offerings are available for attendance yet.
        </div>
      ) : null}

      {selectedOffering ? (
        <form action={saveAttendance} className="rounded-lg border border-white bg-white p-5 shadow-soft">
          <input name="offeringId" type="hidden" value={selectedOfferingId} />
          <input name="date" type="hidden" value={date} />
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-forest-900">Roster attendance</h2>
              <p className="text-sm text-slate-500">{PERIOD_LABEL[selectedOffering.period]} - {selectedOffering.area.name} - {selectedOffering.activity.name}</p>
            </div>
            <Badge tone="amber">Safety critical: absent and not expected are different</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr className="border-b">
                  <th className="py-3">Camper</th>
                  <th>Cabin</th>
                  <th>Mark</th>
                  <th>Status</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {registrations.length ? registrations.map((registration) => {
                  const existing = registration.attendance[0];
                  const outage = activeOutages.find((item) =>
                    item.camperId === registration.camperId ||
                    (item.cabinId && item.cabinId === registration.camper.cabinId)
                  );
                  return (
                    <tr key={registration.id} className="border-b last:border-0">
                      <td className="py-3 font-semibold">
                        {registration.camper.firstName} {registration.camper.lastName}
                        {registration.registrationRole === RegistrationRole.TEACHING_ASSISTANT ? <Badge tone="blue">TA</Badge> : null}
                        {outage ? <Badge tone="amber">Outage: {outage.reason.replaceAll("_", " ")}</Badge> : null}
                      </td>
                      <td>{registration.camper.cabin?.name ?? ""}</td>
                      <td>
                        <select className={inputClass} name={`mark-${registration.id}`} defaultValue={existing?.mark ?? AttendanceMark.PRESENT}>
                          {Object.values(AttendanceMark).map((mark) => <option key={mark} value={mark}>{mark.replaceAll("_", " ")}</option>)}
                        </select>
                      </td>
                      <td>
                        <select className={inputClass} name={`status-${registration.id}`} defaultValue={existing?.camperStatus ?? CamperStatus.ACTIVE}>
                          {Object.values(CamperStatus).map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
                        </select>
                      </td>
                      <td><input className={inputClass} name={`note-${registration.id}`} defaultValue={existing?.note ?? ""} /></td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td className="py-6 text-center text-sm font-medium text-slate-500" colSpan={5}>
                      No campers are currently registered for this offering.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {registrations.length ? <button className={`${buttonClass} mt-4`} type="submit">Save attendance</button> : null}
        </form>
      ) : null}
    </AppShell>
  );
}
