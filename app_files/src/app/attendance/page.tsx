import { AttendanceMark, CamperStatus, RegistrationStatus } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge, PageHeader, buttonClass, inputClass } from "@/components/ui";
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
        where: { sessionId: session.id, active: true },
        include: { area: true, activity: true },
        orderBy: [{ period: "asc" }, { area: { name: "asc" } }, { activity: { name: "asc" } }]
      })
    : [];

  const selectedOfferingId = params?.offeringId ?? offerings[0]?.id;
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

  return (
    <AppShell user={user}>
      <PageHeader title="Attendance" eyebrow="Expected vs missing status" />

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

      <form action={saveAttendance} className="rounded-lg border border-white bg-white p-5 shadow-soft">
        <input name="offeringId" type="hidden" value={selectedOfferingId} />
        <input name="date" type="hidden" value={date} />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-forest-900">Roster attendance</h2>
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
              {registrations.map((registration) => {
                const existing = registration.attendance[0];
                return (
                  <tr key={registration.id} className="border-b last:border-0">
                    <td className="py-3 font-semibold">{registration.camper.firstName} {registration.camper.lastName}</td>
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
              })}
            </tbody>
          </table>
        </div>
        <button className={`${buttonClass} mt-4`} type="submit">Save attendance</button>
      </form>
    </AppShell>
  );
}
