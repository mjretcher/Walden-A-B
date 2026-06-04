import { LimitType, Period, SwimLevel, Unit, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge, Field, PageHeader, Panel, SectionHeader, buttonClass, inputClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, SWIM_LABEL, UNIT_LABEL } from "@/lib/periods";
import { createOffering, updateOffering } from "./actions";

export default async function MenuBuilderPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const session = await prisma.session.findFirst({ where: { active: true } });
  const [areas, activities, offerings] = await Promise.all([
    prisma.area.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.activity.findMany({ where: { active: true, area: { active: true } }, include: { area: true }, orderBy: [{ area: { name: "asc" } }, { name: "asc" }] }),
    session
      ? prisma.activityOffering.findMany({
          where: { sessionId: session.id },
          include: { area: true, activity: true, _count: { select: { registrations: true, staffAssignments: true } } },
          orderBy: [{ period: "asc" }, { area: { name: "asc" } }, { activity: { name: "asc" } }]
        })
      : Promise.resolve([])
  ]);

  return (
    <AppShell user={user}>
      <PageHeader
        title="A/B Menu Builder"
        eyebrow={session?.name ?? "No active session"}
        description="Create and adjust period offerings, limits, eligibility, staffing targets, and operating notes."
      />

      {user.role === UserRole.EXECUTIVE_ADMIN ? (
        <form action={createOffering} className="mb-8 grid gap-5 rounded-lg border border-white/80 bg-white/95 p-5 shadow-soft">
          <SectionHeader title="Add Offering" detail="Choose an existing activity or name a new staff-week addition." />
          <div className="grid gap-4 xl:grid-cols-4">
          <Field label="Area for new activity">
            <select className={inputClass} name="areaId" required>
              {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
            </select>
          </Field>
          <Field label="Existing activity">
            <select className={inputClass} name="activityId">
              {activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.area.name} - {activity.name}</option>)}
            </select>
          </Field>
          <Field label="Or new activity">
            <input className={inputClass} name="newActivityName" placeholder="Staff week addition" />
          </Field>
          <Field label="Period">
            <select className={inputClass} name="period" defaultValue={Period.P1B}>
              {Object.values(Period).map((period) => <option key={period} value={period}>{PERIOD_LABEL[period]}</option>)}
            </select>
          </Field>
          <Field label="Roster limit">
            <input className={inputClass} name="rosterLimit" min="0" type="number" placeholder="18" />
          </Field>
          <Field label="Limit type">
            <select className={inputClass} name="limitType" defaultValue={LimitType.FIXED}>
              {Object.values(LimitType).map((limit) => <option key={limit} value={limit}>{limit.replaceAll("_", " ")}</option>)}
            </select>
          </Field>
          <Field label="Staff target">
            <input className={inputClass} name="staffTarget" min="0" type="number" defaultValue="1" />
          </Field>
          <Field label="Notes">
            <input className={inputClass} name="notes" placeholder="All levels, equipment notes..." />
          </Field>
          </div>
          <div className="xl:col-span-2">
            <p className="mb-2 text-sm font-semibold text-slate-700">Eligible units</p>
            <div className="flex flex-wrap gap-3">
              {Object.values(Unit).map((unit) => (
                <label key={unit} className="cursor-pointer">
                  <input className="peer sr-only" name="eligibleUnits" type="checkbox" value={unit} defaultChecked />
                  <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition peer-checked:border-forest-700 peer-checked:bg-forest-700 peer-checked:text-white hover:border-lake-300">{UNIT_LABEL[unit]}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="xl:col-span-2">
            <p className="mb-2 text-sm font-semibold text-slate-700">Eligible swim levels</p>
            <div className="flex flex-wrap gap-3">
              {Object.values(SwimLevel).map((level) => (
                <label key={level} className="cursor-pointer">
                  <input className="peer sr-only" name="eligibleSwimLevels" type="checkbox" value={level} defaultChecked />
                  <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition peer-checked:border-forest-700 peer-checked:bg-forest-700 peer-checked:text-white hover:border-lake-300">{SWIM_LABEL[level]}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-4 xl:col-span-3">
            <label className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold"><input name="allowOverride" type="checkbox" defaultChecked />Allow override</label>
            <label className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold"><input name="preAssigned" type="checkbox" />Pre-assigned</label>
          </div>
          <button className={buttonClass} type="submit">Add offering</button>
        </form>
      ) : null}

      <Panel>
        <SectionHeader title="Current Offerings" detail="Edit limits, staffing targets, active state, and operating flags.">
          <Badge>{offerings.length} offerings</Badge>
        </SectionHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr className="border-b">
                <th className="py-3">Period</th>
                <th>Area</th>
                <th>Activity</th>
                <th>Limit</th>
                <th>Type</th>
                <th>Staff</th>
                <th>Flags</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {offerings.map((offering) => (
                <tr key={offering.id} className="border-b align-top last:border-0">
                  <td className="py-3 font-semibold">{PERIOD_LABEL[offering.period]}</td>
                  <td>{offering.area.name}</td>
                  <td>{offering.activity.name}</td>
                  <td>{offering._count.registrations} / {offering.rosterLimit ?? "approval"}</td>
                  <td>{offering.limitType.replaceAll("_", " ")}</td>
                  <td>{offering._count.staffAssignments} / {offering.staffTarget}</td>
                  <td className="space-x-1">
                    {offering.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
                    {offering.preAssigned ? <Badge tone="amber">Pre</Badge> : null}
                  </td>
                  <td className="max-w-56 text-slate-500">{offering.notes}</td>
                  <td>
                    {user.role === UserRole.EXECUTIVE_ADMIN ? (
                      <details>
                        <summary className="cursor-pointer font-semibold text-lake-700">Edit</summary>
                        <form action={updateOffering} className="mt-3 grid w-64 gap-2 rounded-md bg-paper p-3">
                          <input name="id" type="hidden" value={offering.id} />
                          <input className={inputClass} name="rosterLimit" type="number" defaultValue={offering.rosterLimit ?? ""} placeholder="Roster limit" />
                          <select className={inputClass} name="limitType" defaultValue={offering.limitType}>
                            {Object.values(LimitType).map((limit) => <option key={limit} value={limit}>{limit}</option>)}
                          </select>
                          <input className={inputClass} name="staffTarget" type="number" defaultValue={offering.staffTarget} />
                          <input className={inputClass} name="notes" defaultValue={offering.notes ?? ""} />
                          <label><input className="mr-2" name="active" type="checkbox" defaultChecked={offering.active} />Active</label>
                          <label><input className="mr-2" name="preAssigned" type="checkbox" defaultChecked={offering.preAssigned} />Pre-assigned</label>
                          <label><input className="mr-2" name="allowOverride" type="checkbox" defaultChecked={offering.allowOverride} />Allow override</label>
                          <button className={buttonClass} type="submit">Save</button>
                        </form>
                      </details>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </AppShell>
  );
}
