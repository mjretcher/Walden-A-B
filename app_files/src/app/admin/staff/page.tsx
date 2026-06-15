import { Period, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge, Field, PageHeader, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, STAFF_PERIODS } from "@/lib/periods";
import { staffingActivityLabel, staffingAreaLabel } from "@/lib/staffing-groups";
import { assignStaffToOffering, createStaff, deleteStaff, removeStaffAssignment, setStaffActive, updateStaffProfile } from "./actions";

type StaffSearchParams = {
  q?: string | string[];
};

type StaffWithRelations = Awaited<ReturnType<typeof loadStaff>>[number];
type OfferingWithRelations = Awaited<ReturnType<typeof loadOfferings>>[number];

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function staffName(staff: { firstName: string; lastName: string }) {
  return `${staff.firstName} ${staff.lastName}`;
}

function inactiveNames(items: { active: boolean; name: string }[]) {
  return items.filter((item) => !item.active).map((item) => item.name);
}

async function loadStaff(query: string) {
  return prisma.staff.findMany({
    where: query
      ? {
          OR: [
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { primaryArea: { name: { contains: query, mode: "insensitive" } } }
          ]
        }
      : undefined,
    include: {
      cabin: true,
      primaryArea: true,
      secondaryAreas: { orderBy: { name: "asc" } },
      skills: { orderBy: { name: "asc" } },
      certifications: { orderBy: { name: "asc" } },
      assignments: {
        include: { offering: { include: { area: true, activity: true } } },
        orderBy: [{ period: "asc" }]
      }
    },
    orderBy: [{ active: "desc" }, { lastName: "asc" }, { firstName: "asc" }]
  });
}

async function loadOfferings(sessionId?: string) {
  return sessionId
    ? prisma.activityOffering.findMany({
        where: { sessionId, active: true, area: { active: true }, activity: { active: true } },
        include: { area: true, activity: true },
        orderBy: [{ period: "asc" }, { area: { name: "asc" } }, { activity: { name: "asc" } }]
      })
    : Promise.resolve([]);
}

function AssignmentControls({
  staff,
  period,
  offerings
}: {
  staff: StaffWithRelations;
  period: Period;
  offerings: OfferingWithRelations[];
}) {
  const assignment = staff.assignments.find((item) => item.period === period);
  const periodOfferings = offerings.filter((offering) => offering.period === period);

  return (
    <div className="rounded-md border border-slate-100 bg-paper/70 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-forest-900">{PERIOD_LABEL[period]}</p>
          <p className="mt-1 text-sm text-slate-600">
            {assignment ? `${staffingAreaLabel(assignment.offering.area.name, assignment.offering.activity.name)} - ${staffingActivityLabel(assignment.offering.activity.name)}` : "Unassigned"}
          </p>
          {assignment?.notes ? <p className="mt-1 text-xs text-amber-800">{assignment.notes}</p> : null}
        </div>
        {assignment ? <Badge tone="green">Assigned</Badge> : <Badge>Open</Badge>}
      </div>
      <form action={assignStaffToOffering} className="mt-3 grid gap-2">
        <input name="staffId" type="hidden" value={staff.id} />
        <select className={inputClass} name="offeringId" defaultValue={assignment?.offeringId ?? ""} required>
          <option value="">Select active offering</option>
          {periodOfferings.map((offering) => (
            <option key={offering.id} value={offering.id}>
              {staffingAreaLabel(offering.area.name, offering.activity.name)} - {staffingActivityLabel(offering.activity.name)}
            </option>
          ))}
        </select>
        <input className={inputClass} name="role" defaultValue={assignment?.role ?? "Lead"} />
        <button className={buttonClass} type="submit">{assignment ? "Reassign" : "Assign"}</button>
      </form>
      {assignment ? (
        <form action={removeStaffAssignment} className="mt-2">
          <input name="assignmentId" type="hidden" value={assignment.id} />
          <button className={secondaryButtonClass} type="submit">Remove assignment</button>
        </form>
      ) : null}
    </div>
  );
}

export default async function StaffManagementPage({ searchParams }: { searchParams?: Promise<StaffSearchParams> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const params = searchParams ? await searchParams : {};
  const query = firstParam(params.q).trim();
  const session = await prisma.session.findFirst({ where: { active: true } });
  const [staff, cabins, areas, skills, certifications, offerings] = await Promise.all([
    loadStaff(query),
    prisma.cabin.findMany({ orderBy: [{ unit: "asc" }, { name: "asc" }] }),
    prisma.area.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.skill.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.certification.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    loadOfferings(session?.id)
  ]);

  return (
    <AppShell user={user}>
      <PageHeader title="Staff Management" eyebrow="Staff profiles and assignments" />

      <form className="mb-6 flex flex-col gap-3 rounded-lg border border-white bg-white p-5 shadow-soft md:flex-row" method="get">
        <Field label="Staff search">
          <input className={inputClass} name="q" defaultValue={query} />
        </Field>
        <div className="flex items-end gap-2">
          <button className={buttonClass} type="submit">Search</button>
          <a className={secondaryButtonClass} href="/admin/staff">Clear</a>
        </div>
      </form>

      <details className="mb-6 rounded-lg border border-white bg-white p-5 shadow-soft">
        <summary className="cursor-pointer list-none text-lg font-black text-forest-900">Add Staff Member</summary>
        <form action={createStaff} className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="First name">
            <input className={inputClass} name="firstName" required />
          </Field>
          <Field label="Last name">
            <input className={inputClass} name="lastName" required />
          </Field>
          <Field label="Primary area">
            <select className={inputClass} name="primaryAreaId" defaultValue="">
              <option value="">None</option>
              {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
            </select>
          </Field>
          <Field label="Age">
            <input className={inputClass} name="age" step="0.01" type="number" />
          </Field>
          <Field label="Position">
            <input className={inputClass} name="position" />
          </Field>
          <Field label="Position 2">
            <input className={inputClass} name="position2" />
          </Field>
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700">
            <input name="screamEligible" type="checkbox" defaultChecked />
            Show in Scream Session
          </label>
          <div className="flex items-end">
            <button className={buttonClass} type="submit">Add staff</button>
          </div>
        </form>
      </details>

      <div className="space-y-4">
        {staff.map((row) => {
          const inactiveSecondaryAreas = inactiveNames(row.secondaryAreas);
          const inactiveSkills = inactiveNames(row.skills);
          const inactiveCertifications = inactiveNames(row.certifications);

          return (
            <details key={row.id} className="rounded-lg border border-white bg-white p-5 shadow-soft">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-forest-900">{staffName(row)}</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {row.cabin?.name ?? "No cabin"} / {row.primaryArea?.name ?? "No primary area"} / {row.assignments.length} assignments
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {row.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
                    {row.assignments.length ? <Badge tone="blue">Schedule visible</Badge> : <Badge>Schedule open</Badge>}
                  </div>
                </div>
              </summary>

              <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(22rem,0.9fr)_1.1fr]">
                <div className="xl:col-span-2 flex flex-wrap gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <form action={setStaffActive}>
                    <input name="staffId" type="hidden" value={row.id} />
                    <input name="active" type="hidden" value={row.active ? "false" : "true"} />
                    <button className={secondaryButtonClass} type="submit">{row.active ? "Deactivate staff" : "Reactivate staff"}</button>
                  </form>
                  <details className="relative">
                    <summary className="inline-flex min-h-11 cursor-pointer list-none items-center justify-center rounded-lg border border-red-200 bg-white px-4 text-sm font-black text-red-800">Delete staff</summary>
                    <form action={deleteStaff} className="absolute z-10 mt-2 w-80 rounded-xl border border-red-200 bg-white p-4 shadow-panel">
                      <input name="staffId" type="hidden" value={row.id} />
                      <p className="text-sm font-bold text-red-800">Type DELETE to permanently remove this staff member and related assignments/history.</p>
                      <input className={`${inputClass} mt-3`} name="confirmDelete" placeholder="DELETE" />
                      <button className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-red-600 px-3 text-sm font-black text-white" type="submit">Confirm delete</button>
                    </form>
                  </details>
                </div>
                <form action={updateStaffProfile} className="grid gap-4 rounded-md border border-slate-100 bg-paper/70 p-4">
                  <input name="id" type="hidden" value={row.id} />
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Position">
                      <input className={inputClass} name="position" defaultValue={row.position ?? ""} />
                    </Field>
                    <Field label="Position 2">
                      <input className={inputClass} name="position2" defaultValue={row.position2 ?? ""} />
                    </Field>
                    <Field label="Age">
                      <input className={inputClass} name="age" step="0.01" type="number" defaultValue={row.age ?? ""} />
                    </Field>
                    <Field label="Employment start">
                      <input className={inputClass} name="employmentStart" type="date" defaultValue={row.employmentStart ? row.employmentStart.toISOString().slice(0, 10) : ""} />
                    </Field>
                    <Field label="Employment end">
                      <input className={inputClass} name="employmentEnd" type="date" defaultValue={row.employmentEnd ? row.employmentEnd.toISOString().slice(0, 10) : ""} />
                    </Field>
                    <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700">
                      <input name="screamEligible" type="checkbox" defaultChecked={row.screamEligible} />
                      Show in Scream Session
                    </label>
                    <Field label="Cabin assignment">
                      <select className={inputClass} name="cabinId" defaultValue={row.cabinId ?? ""}>
                        <option value="">None</option>
                        {cabins.map((cabin) => <option key={cabin.id} value={cabin.id}>{cabin.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Primary area">
                      <select className={inputClass} name="primaryAreaId" defaultValue={row.primaryArea?.active ? row.primaryAreaId ?? "" : ""}>
                        <option value="">None</option>
                        {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
                      </select>
                    </Field>
                  </div>
                  {row.primaryArea && !row.primaryArea.active ? <Badge tone="amber">Inactive primary area retained: {row.primaryArea.name}</Badge> : null}
                  <Field label="Secondary areas">
                    <select className={inputClass} name="secondaryAreaIds" defaultValue={row.secondaryAreas.filter((area) => area.active).map((area) => area.id)} multiple>
                      {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
                    </select>
                  </Field>
                  {inactiveSecondaryAreas.length ? <p className="text-xs font-semibold text-amber-800">Inactive retained: {inactiveSecondaryAreas.join(", ")}</p> : null}
                  <Field label="Skills">
                    <select className={inputClass} name="skillIds" defaultValue={row.skills.filter((skill) => skill.active).map((skill) => skill.id)} multiple>
                      {skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
                    </select>
                  </Field>
                  {inactiveSkills.length ? <p className="text-xs font-semibold text-amber-800">Inactive retained: {inactiveSkills.join(", ")}</p> : null}
                  <Field label="Certifications">
                    <select className={inputClass} name="certificationIds" defaultValue={row.certifications.filter((certification) => certification.active).map((certification) => certification.id)} multiple>
                      {certifications.map((certification) => <option key={certification.id} value={certification.id}>{certification.name}</option>)}
                    </select>
                  </Field>
                  {inactiveCertifications.length ? <p className="text-xs font-semibold text-amber-800">Inactive retained: {inactiveCertifications.join(", ")}</p> : null}
                  <Field label="Schedule visibility">
                    <input className={inputClass} name="sessionAvailability" defaultValue={row.sessionAvailability ?? ""} />
                  </Field>
                  <Field label="Assignment visibility">
                    <input className={inputClass} name="availabilityNotes" defaultValue={row.availabilityNotes ?? ""} />
                  </Field>
                  <Field label="Certification notes">
                    <input className={inputClass} name="statusCertification" defaultValue={row.statusCertification ?? ""} />
                  </Field>
                  <button className={buttonClass} type="submit">Save staff</button>
                </form>

                <section>
                  <h3 className="font-bold text-forest-900">Assignments by period</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {STAFF_PERIODS.map((period) => (
                      <AssignmentControls key={period} staff={row} period={period} offerings={offerings} />
                    ))}
                  </div>
                </section>
              </div>
            </details>
          );
        })}
      </div>
    </AppShell>
  );
}
