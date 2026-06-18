import { LimitType, Period, Prisma, RegistrationRole, RegistrationStatus, SwimLevel, Unit, UserRole } from "@prisma/client";
import Link from "next/link";
import { ActivityIcon } from "@/components/activity-icon";
import { AppShell } from "@/components/app-shell";
import { Badge, Field, PageHeader, Panel, SectionHeader, buttonClass, dangerButtonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { readStringArray } from "@/lib/local-arrays";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, SWIM_LABEL, UNIT_LABEL } from "@/lib/periods";
import { createOffering, deleteOffering, updateOffering } from "./actions";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];
type OfferingRow = Prisma.ActivityOfferingGetPayload<{
  include: {
    area: true;
    activity: { include: { requiredCertifications: true } };
    _count: { select: { registrations: true; staffAssignments: true } };
  };
}>;

export default async function MenuBuilderPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const session = await prisma.session.findFirst({ where: { active: true } });
  const [areas, activities, certifications, offerings] = await Promise.all([
    prisma.area.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.activity.findMany({ where: { active: true, area: { active: true } }, include: { area: true, requiredCertifications: true }, orderBy: [{ area: { name: "asc" } }, { name: "asc" }] }),
    prisma.certification.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    session
      ? prisma.activityOffering.findMany({
          where: { sessionId: session.id },
          include: { area: true, activity: { include: { requiredCertifications: true } }, _count: { select: { registrations: { where: { registrationRole: RegistrationRole.CAMPER, status: { in: activeRegistration } } }, staffAssignments: true } } },
          orderBy: [{ area: { name: "asc" } }, { period: "asc" }, { activity: { name: "asc" } }]
        })
      : Promise.resolve([] as OfferingRow[])
  ]);
  const offeringsByArea = offerings.reduce<{ area: OfferingRow["area"]; offerings: OfferingRow[] }[]>((groups, offering) => {
    const group = groups.find((item) => item.area.id === offering.area.id);
    if (group) group.offerings.push(offering);
    else groups.push({ area: offering.area, offerings: [offering] });
    return groups;
  }, []);

  return (
    <AppShell user={user}>
      <PageHeader
        title="A/B Menu Builder"
        eyebrow={session?.name ?? "No active session"}
        description="Create and adjust period offerings, limits, eligibility, staffing targets, and operating notes."
      >
        <Link className={secondaryButtonClass} href="/reports/ab-menu">Print A/B Menu</Link>
      </PageHeader>

      {user.role === UserRole.EXECUTIVE_ADMIN ? (
        <form action={createOffering} className="mb-8 grid gap-5 rounded-lg border border-white/80 bg-white/95 p-5 shadow-soft">
          <SectionHeader title="Add Offering" detail="Choose an existing activity or name a new staff-week addition." />
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-6">
            <div className="2xl:col-span-2">
              <Field label="Area for new activity">
                <select className={inputClass} name="areaId" required>
                  {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="2xl:col-span-2">
              <Field label="Existing activity">
                <select className={inputClass} name="activityId">
                  {activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.area.name} - {activity.name}</option>)}
                </select>
              </Field>
            </div>
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
            <div className="md:col-span-2 2xl:col-span-3">
              <Field label="Notes">
                <input className={inputClass} name="notes" placeholder="All levels, equipment notes..." />
              </Field>
            </div>
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
            <input name="visibleOnMenu" type="hidden" value="off" />
            <label className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold"><input name="visibleOnMenu" type="checkbox" value="on" defaultChecked />Show on A/B menu</label>
          </div>
          {certifications.length ? (
            <div className="xl:col-span-4">
              <p className="mb-2 text-sm font-semibold text-slate-700">Required certifications for this activity</p>
              <div className="flex flex-wrap gap-2">
                {certifications.map((certification) => (
                  <label key={certification.id} className="cursor-pointer">
                    <input className="peer sr-only" name="certificationIds" type="checkbox" value={certification.id} />
                    <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition peer-checked:border-lake-700 peer-checked:bg-lake-700 peer-checked:text-white hover:border-lake-300">{certification.name}</span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-500">These drive Scream Session warnings when a staff member lacks a required certification.</p>
            </div>
          ) : null}
          <button className={buttonClass} type="submit">Add offering</button>
        </form>
      ) : null}

      <Panel>
        <SectionHeader title="Current Offerings" detail="Edit limits, staffing targets, active state, and operating flags.">
          <Badge>{offerings.length} offerings</Badge>
        </SectionHeader>
        <div className="space-y-3">
          {offeringsByArea.map((group) => (
            <details key={group.area.id} className="rounded-lg border border-slate-200 bg-white">
              <summary className="cursor-pointer px-4 py-3 font-black text-forest-900">
                <span className="ml-2 inline-flex items-center gap-2">
                  <ActivityIcon area={group.area.name} size="sm" />
                  {group.area.name}
                  <Badge>{group.offerings.length} offerings</Badge>
                </span>
              </summary>
              <div className="overflow-x-auto border-t border-slate-200">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr className="border-b">
                      <th className="py-3 pl-4">Period</th>
                      <th>Activity</th>
                      <th>Limit</th>
                      <th>Type</th>
                      <th>Staff</th>
                      <th>Certs</th>
                      <th>Flags</th>
                      <th>Notes</th>
                      <th className="pr-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.offerings.map((offering) => {
                      const eligibleUnits = readStringArray(offering.eligibleUnits) as Unit[];
                      return (
                      <tr key={offering.id} className="border-b align-top last:border-0">
                        <td className="py-3 pl-4 font-semibold">{PERIOD_LABEL[offering.period]}</td>
                        <td>
                          <span className="inline-flex min-w-0 items-center gap-2">
                            <ActivityIcon activity={offering.activity.name} area={offering.area.name} size="sm" />
                            <span className="font-bold text-forest-900">{offering.activity.name}</span>
                          </span>
                        </td>
                        <td>{offering._count.registrations} / {offering.rosterLimit ?? "approval"}</td>
                        <td>{offering.limitType.replaceAll("_", " ")}</td>
                        <td>{offering._count.staffAssignments} / {offering.staffTarget}</td>
                        <td>
                          <div className="flex max-w-44 flex-wrap gap-1">
                            {offering.activity.requiredCertifications.length ? offering.activity.requiredCertifications.map((certification) => (
                              <Badge key={certification.id} tone="blue">{certification.name}</Badge>
                            )) : <span className="text-xs font-semibold text-slate-400">None</span>}
                          </div>
                        </td>
                        <td className="space-x-1">
                          {offering.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
                          {offering.preAssigned ? <Badge tone="amber">Pre</Badge> : null}
                          {offering.visibleOnMenu ? <Badge tone="blue">Menu</Badge> : <Badge>Hidden</Badge>}
                        </td>
                        <td className="max-w-56 text-slate-500">{offering.notes}</td>
                        <td className="pr-4">
                          {user.role === UserRole.EXECUTIVE_ADMIN ? (
                            <div className="grid gap-2">
                              <details>
                                <summary className="cursor-pointer font-semibold text-lake-700">Edit</summary>
                                <form action={updateOffering} className="mt-3 grid w-80 gap-3 rounded-md bg-paper p-3">
                                  <input name="id" type="hidden" value={offering.id} />
                                  <div className="rounded-md border border-slate-200 bg-white p-3">
                                    <p className="text-xs font-black uppercase tracking-wide text-slate-500">Editing class offering</p>
                                    <p className="mt-1 font-black text-forest-900">{offering.activity.name}</p>
                                    <p className="text-xs font-semibold text-slate-600">{offering.area.name} · {PERIOD_LABEL[offering.period]}</p>
                                  </div>
                                  <div>
                                    <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Eligible units</p>
                                    <div className="flex flex-wrap gap-2">
                                      {eligibleUnits.length ? eligibleUnits.map((unit) => (
                                        <span key={unit} className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-black text-slate-700">{UNIT_LABEL[unit]}</span>
                                      )) : <span className="text-xs font-semibold text-slate-500">All units</span>}
                                    </div>
                                    <p className="mt-1 text-[11px] font-semibold text-slate-500">Unit eligibility is shown here so you know which class offering you are editing.</p>
                                  </div>
                                  <Field label="Maximum class size / roster limit">
                                    <input className={inputClass} name="rosterLimit" min="0" type="number" defaultValue={offering.rosterLimit ?? ""} placeholder="Leave blank for approval/unlimited" />
                                  </Field>
                                  <Field label="Class size limit type">
                                    <select className={inputClass} name="limitType" defaultValue={offering.limitType}>
                                      {Object.values(LimitType).map((limit) => <option key={limit} value={limit}>{limit.replaceAll("_", " ")}</option>)}
                                    </select>
                                  </Field>
                                  <Field label="Staff target">
                                    <input className={inputClass} name="staffTarget" min="0" type="number" defaultValue={offering.staffTarget} />
                                  </Field>
                                  <Field label="Operating notes">
                                    <input className={inputClass} name="notes" defaultValue={offering.notes ?? ""} placeholder="Equipment, level, or operating notes" />
                                  </Field>
                                  <div className="grid gap-2 rounded-md border border-slate-200 bg-white p-3 text-sm font-bold">
                                    <label><input className="mr-2" name="active" type="checkbox" defaultChecked={offering.active} />Active and visible for registration/reports</label>
                                    <label><input className="mr-2" name="preAssigned" type="checkbox" defaultChecked={offering.preAssigned} />Pre-assigned class</label>
                                    <input name="visibleOnMenu" type="hidden" value="off" />
                                    <label><input className="mr-2" name="visibleOnMenu" type="checkbox" value="on" defaultChecked={offering.visibleOnMenu} />Show on A/B menu</label>
                                    <label><input className="mr-2" name="allowOverride" type="checkbox" defaultChecked={offering.allowOverride} />Allow executive override</label>
                                  </div>
                                  {certifications.length ? (
                                    <div>
                                      <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Required certifications</p>
                                      <div className="flex flex-wrap gap-2">
                                        {certifications.map((certification) => {
                                          const checked = offering.activity.requiredCertifications.some((required) => required.id === certification.id);
                                          return (
                                            <label key={certification.id} className="cursor-pointer">
                                              <input className="peer sr-only" name="certificationIds" type="checkbox" value={certification.id} defaultChecked={checked} />
                                              <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-black text-slate-700 transition peer-checked:border-lake-700 peer-checked:bg-lake-700 peer-checked:text-white hover:border-lake-300">{certification.name}</span>
                                            </label>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ) : null}
                                  <button className={buttonClass} type="submit">Save</button>
                                </form>
                              </details>
                              <details>
                                <summary className="cursor-pointer font-semibold text-red-700">Delete</summary>
                                <form action={deleteOffering} className="mt-3 grid w-64 gap-2 rounded-md border border-red-200 bg-red-50 p-3">
                                  <input name="id" type="hidden" value={offering.id} />
                                  <p className="text-xs font-bold text-red-800">Type DELETE to permanently remove this offering and its registrations/staffing records.</p>
                                  <input className={inputClass} name="confirmDelete" placeholder="DELETE" />
                                  <button className={dangerButtonClass} type="submit">Delete offering</button>
                                </form>
                              </details>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      </Panel>
    </AppShell>
  );
}
