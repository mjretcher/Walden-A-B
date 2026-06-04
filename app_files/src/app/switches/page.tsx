import { RegistrationStatus, SwitchStatus, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge, Field, PageHeader, StatCard, buttonClass, inputClass } from "@/components/ui";
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

  const pendingSwitches = switches.filter((request) => request.status === SwitchStatus.PENDING);
  const approvedSwitches = switches.filter((request) => request.status === SwitchStatus.APPROVED);
  const deniedSwitches = switches.filter((request) => request.status === SwitchStatus.DENIED);
  const canCreateCamperSwitch = registrations.length > 0 && offerings.length > 0;
  const canCreateStaffSwitch = assignments.length > 0 && offerings.length > 0;

  return (
    <AppShell user={user}>
      <PageHeader title="Switch Workflows" eyebrow="Camper and staff schedule changes" />

      {!session ? (
        <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900">
          No active session is selected, so switch requests are not available yet.
        </div>
      ) : null}

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pending switches" value={pendingSwitches.length} tone={pendingSwitches.length ? "warning" : "forest"} detail="Awaiting decision" />
        <StatCard label="Approved" value={approvedSwitches.length} tone="forest" detail="Approved this session" />
        <StatCard label="Denied" value={deniedSwitches.length} tone={deniedSwitches.length ? "warning" : "forest"} detail="Denied this session" />
        <StatCard label="Available offerings" value={offerings.length} detail="Eligible switch destinations" />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <form action={createCamperSwitch} className="rounded-lg border border-white bg-white p-5 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-bold text-forest-900">Create camper switch</h2>
            {!canCreateCamperSwitch ? <Badge tone="amber">Needs camper registration and offering</Badge> : null}
          </div>
          <div className="mt-4 grid gap-4">
            <Field label="Current registration">
              <select className={inputClass} name="currentRegistrationId" disabled={!canCreateCamperSwitch}>
                {registrations.map((registration) => (
                  <option key={registration.id} value={registration.id}>
                    {registration.camper.firstName} {registration.camper.lastName} - {PERIOD_LABEL[registration.period]} - {registration.offering.activity.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Requested offering">
              <select className={inputClass} name="requestedOfferingId" disabled={!canCreateCamperSwitch}>
                {offerings.map((offering) => (
                  <option key={offering.id} value={offering.id}>
                    {PERIOD_LABEL[offering.period]} - {offering.area.name} - {offering.activity.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reason">
              <input className={inputClass} name="reason" disabled={!canCreateCamperSwitch} />
            </Field>
            {canCreateCamperSwitch ? (
              <button className={buttonClass} type="submit">Create switch request</button>
            ) : (
              <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-600">
                Add at least one active camper registration and active offering before creating camper switches.
              </p>
            )}
          </div>
        </form>

        <form action={createStaffSwitch} className="rounded-lg border border-white bg-white p-5 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-bold text-forest-900">Create staff switch</h2>
            {!canCreateStaffSwitch ? <Badge tone="amber">Needs staff assignment and offering</Badge> : null}
          </div>
          <div className="mt-4 grid gap-4">
            <Field label="Current assignment">
              <select className={inputClass} name="staffAssignmentId" disabled={!canCreateStaffSwitch}>
                {assignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.staff.firstName} {assignment.staff.lastName} - {PERIOD_LABEL[assignment.period]} - {assignment.offering.activity.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Requested offering">
              <select className={inputClass} name="requestedOfferingId" disabled={!canCreateStaffSwitch}>
                {offerings.map((offering) => (
                  <option key={offering.id} value={offering.id}>
                    {PERIOD_LABEL[offering.period]} - {offering.area.name} - {offering.activity.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reason">
              <input className={inputClass} name="reason" disabled={!canCreateStaffSwitch} />
            </Field>
            {canCreateStaffSwitch ? (
              <button className={buttonClass} type="submit">Create staff request</button>
            ) : (
              <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-600">
                Add at least one staff assignment and active offering before creating staff switches.
              </p>
            )}
          </div>
        </form>
      </div>

      <section className="mt-6 rounded-lg border border-white bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-forest-900">Switch history</h2>
          <Badge tone={pendingSwitches.length ? "amber" : "green"}>{pendingSwitches.length} pending</Badge>
        </div>
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
              {switches.length ? switches.map((request) => (
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
              )) : (
                <tr>
                  <td className="py-6 text-center text-sm font-medium text-slate-500" colSpan={7}>
                    No switch requests have been created for this session yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
