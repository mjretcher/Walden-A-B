import { RegistrationStatus, SwitchStatus, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge, Field, PageHeader, buttonClass, inputClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL } from "@/lib/periods";
import { createCamperSwitch, createStaffSwitch, decideSwitch } from "./actions";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

export default async function SwitchesPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const session = await prisma.session.findFirst({ where: { active: true } });
  const [registrations, assignments, offerings, switches] = session
    ? await Promise.all([
        prisma.registration.findMany({
          where: { sessionId: session.id, status: { in: activeRegistration } },
          include: { camper: { include: { cabin: true } }, offering: { include: { activity: true, area: true } } },
          orderBy: [{ period: "asc" }]
        }),
        prisma.staffAssignment.findMany({
          where: { sessionId: session.id },
          include: { staff: true, offering: { include: { activity: true, area: true } } },
          orderBy: [{ period: "asc" }]
        }),
        prisma.activityOffering.findMany({
          where: {
            sessionId: session.id,
            active: true,
            areaId: user.role === UserRole.AREA_HEAD && user.areaId ? user.areaId : undefined,
            area: { active: true },
            activity: { active: true }
          },
          include: { activity: true, area: true },
          orderBy: [{ period: "asc" }, { area: { name: "asc" } }, { activity: { name: "asc" } }]
        }),
        prisma.switchRequest.findMany({
          where: { sessionId: session.id },
          include: {
            camper: true,
            staff: true,
            currentOffering: { include: { activity: true, area: true } },
            requestedOffering: { include: { activity: true, area: true } }
          },
          orderBy: { createdAt: "desc" }
        })
      ])
    : [[], [], [], []];

  return (
    <AppShell user={user}>
      <PageHeader title="Switch Workflows" eyebrow="Camper and staff schedule changes" />

      <div className="grid gap-6 xl:grid-cols-2">
        <form action={createCamperSwitch} className="rounded-lg border border-white bg-white p-5 shadow-soft">
          <h2 className="text-lg font-bold text-forest-900">Create camper switch</h2>
          <div className="mt-4 grid gap-4">
            <Field label="Current registration">
              <select className={inputClass} name="currentRegistrationId">
                {registrations.map((registration) => (
                  <option key={registration.id} value={registration.id}>
                    {registration.camper.firstName} {registration.camper.lastName} - {PERIOD_LABEL[registration.period]} - {registration.offering.activity.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Requested offering">
              <select className={inputClass} name="requestedOfferingId">
                {offerings.map((offering) => (
                  <option key={offering.id} value={offering.id}>
                    {PERIOD_LABEL[offering.period]} - {offering.area.name} - {offering.activity.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reason">
              <input className={inputClass} name="reason" />
            </Field>
            <button className={buttonClass} type="submit">Create switch request</button>
          </div>
        </form>

        <form action={createStaffSwitch} className="rounded-lg border border-white bg-white p-5 shadow-soft">
          <h2 className="text-lg font-bold text-forest-900">Create staff switch</h2>
          <div className="mt-4 grid gap-4">
            <Field label="Current assignment">
              <select className={inputClass} name="staffAssignmentId">
                {assignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.staff.firstName} {assignment.staff.lastName} - {PERIOD_LABEL[assignment.period]} - {assignment.offering.activity.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Requested offering">
              <select className={inputClass} name="requestedOfferingId">
                {offerings.map((offering) => (
                  <option key={offering.id} value={offering.id}>
                    {PERIOD_LABEL[offering.period]} - {offering.area.name} - {offering.activity.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reason">
              <input className={inputClass} name="reason" />
            </Field>
            <button className={buttonClass} type="submit">Create staff request</button>
          </div>
        </form>
      </div>

      <section className="mt-6 rounded-lg border border-white bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-forest-900">Switch history</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr className="border-b">
                <th className="py-3">Type</th>
                <th>Person</th>
                <th>Current</th>
                <th>Requested</th>
                <th>Status</th>
                <th>Validation</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {switches.map((request) => (
                <tr key={request.id} className="border-b align-top last:border-0">
                  <td className="py-3 font-semibold">{request.type}</td>
                  <td>{request.camper ? `${request.camper.firstName} ${request.camper.lastName}` : request.staff ? `${request.staff.firstName} ${request.staff.lastName}` : "-"}</td>
                  <td>{request.currentOffering ? `${PERIOD_LABEL[request.period]} ${request.currentOffering.activity.name}` : "-"}</td>
                  <td>{request.requestedOffering ? `${request.requestedOffering.area.name} - ${request.requestedOffering.activity.name}` : "-"}</td>
                  <td><Badge tone={request.status === SwitchStatus.PENDING ? "amber" : request.status === SwitchStatus.DENIED ? "red" : "green"}>{request.status}</Badge></td>
                  <td className="max-w-64 text-slate-500">{request.validationNotes}</td>
                  <td>
                    {request.status === SwitchStatus.PENDING ? (
                      <div className="flex gap-2">
                        <form action={decideSwitch}>
                          <input name="id" type="hidden" value={request.id} />
                          <input name="decision" type="hidden" value="approve" />
                          <button className="rounded-md bg-forest-700 px-3 py-2 text-xs font-semibold text-white">Approve</button>
                        </form>
                        <form action={decideSwitch}>
                          <input name="id" type="hidden" value={request.id} />
                          <input name="decision" type="hidden" value="deny" />
                          <button className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold">Deny</button>
                        </form>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
