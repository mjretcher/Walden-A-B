import { UserRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Badge, Field, PageHeader, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteStaff, setStaffActive, updateStaffProfile } from "../actions";

type StaffDetail = NonNullable<Awaited<ReturnType<typeof loadStaffDetail>>>;

const availabilityOptions = [
  "All 7 Weeks",
  "Arrives Late",
  "Leaves Early",
  "Custom Dates"
];

const defaultHousingLabels = ["Staff House", "Nurse Cabin", "Health Center", "Out of Cabin", "Office", "Leadership House"];

function staffName(staff: { firstName: string; lastName: string }) {
  return `${staff.firstName} ${staff.lastName}`;
}

function inactiveNames(items: { active: boolean; name: string }[]) {
  return items.filter((item) => !item.active).map((item) => item.name);
}

function housingName(staff: { housingLabel: string | null; cabin?: { name: string } | null }) {
  return staff.housingLabel ?? staff.cabin?.name ?? "No cabin";
}

async function loadStaffDetail(id: string) {
  return prisma.staff.findUnique({
    where: { id },
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
    }
  });
}

export default async function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const { id } = await params;
  const [staff, cabins, areas, skills, certifications] = await Promise.all([
    loadStaffDetail(id),
    prisma.cabin.findMany({ orderBy: [{ unit: "asc" }, { name: "asc" }] }),
    prisma.area.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.skill.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.certification.findMany({ where: { active: true }, orderBy: { name: "asc" } })
  ]);
  if (!staff) notFound();

  const inactiveSecondaryAreas = inactiveNames(staff.secondaryAreas);
  const inactiveSkills = inactiveNames(staff.skills);
  const inactiveCertifications = inactiveNames(staff.certifications);
  const housingOptions = Array.from(new Set([...defaultHousingLabels, staff.housingLabel].filter(Boolean) as string[])).sort();

  return (
    <AppShell user={user}>
      <PageHeader title={staffName(staff)} eyebrow="Staff detail">
        <Link className={secondaryButtonClass} href="/admin/staff">Back to Staff Management</Link>
      </PageHeader>
      <datalist id="staff-housing-options">
        {housingOptions.map((label) => <option key={label} value={label} />)}
      </datalist>

      <div className="mb-5 flex flex-wrap gap-2">
        {staff.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
        <Badge>{housingName(staff)}</Badge>
        <Badge tone="blue">{staff.assignments.length} assignments</Badge>
      </div>

      <div className="mb-5 flex flex-wrap gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
        <form action={setStaffActive}>
          <input name="staffId" type="hidden" value={staff.id} />
          <input name="active" type="hidden" value={staff.active ? "false" : "true"} />
          <button className={secondaryButtonClass} type="submit">{staff.active ? "Deactivate staff" : "Reactivate staff"}</button>
        </form>
        <details className="relative">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center justify-center rounded-lg border border-red-200 bg-white px-4 text-sm font-black text-red-800">Delete staff</summary>
          <form action={deleteStaff} className="absolute z-10 mt-2 w-80 rounded-xl border border-red-200 bg-white p-4 shadow-panel">
            <input name="staffId" type="hidden" value={staff.id} />
            <p className="text-sm font-bold text-red-800">Type DELETE to permanently remove this staff member and related assignments/history.</p>
            <input className={`${inputClass} mt-3`} name="confirmDelete" placeholder="DELETE" />
            <button className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-red-600 px-3 text-sm font-black text-white" type="submit">Confirm delete</button>
          </form>
        </details>
      </div>

      <form action={updateStaffProfile} className="grid gap-4 rounded-md border border-slate-100 bg-paper/70 p-4">
        <input name="id" type="hidden" value={staff.id} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="First name">
            <input className={inputClass} name="firstName" defaultValue={staff.firstName} required />
          </Field>
          <Field label="Last name">
            <input className={inputClass} name="lastName" defaultValue={staff.lastName} required />
          </Field>
          <Field label="Position">
            <input className={inputClass} name="position" defaultValue={staff.position ?? ""} />
          </Field>
          <Field label="Position 2">
            <input className={inputClass} name="position2" defaultValue={staff.position2 ?? ""} />
          </Field>
          <Field label="Age">
            <input className={inputClass} name="age" step="0.01" type="number" defaultValue={staff.age ?? ""} />
          </Field>
          <Field label="Availability type">
            <select className={inputClass} name="sessionAvailability" defaultValue={staff.sessionAvailability ?? "All 7 Weeks"}>
              {availabilityOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </Field>
          <Field label="Arrival date">
            <input className={inputClass} name="employmentStart" type="date" defaultValue={staff.employmentStart ? staff.employmentStart.toISOString().slice(0, 10) : ""} />
          </Field>
          <Field label="Departure date">
            <input className={inputClass} name="employmentEnd" type="date" defaultValue={staff.employmentEnd ? staff.employmentEnd.toISOString().slice(0, 10) : ""} />
          </Field>
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700">
            <input name="screamEligible" type="checkbox" defaultChecked={staff.screamEligible} />
            Show in Scream Session
          </label>
          <Field label="Cabin assignment">
            <select className={inputClass} name="cabinId" defaultValue={staff.cabinId ?? ""}>
              <option value="">None</option>
              {cabins.map((cabin) => <option key={cabin.id} value={cabin.id}>{cabin.name}</option>)}
            </select>
          </Field>
          <Field label="Or custom staff housing">
            <input className={inputClass} list="staff-housing-options" name="housingLabel" defaultValue={staff.housingLabel ?? ""} placeholder="Staff House" />
          </Field>
          <Field label="Primary area">
            <select className={inputClass} name="primaryAreaId" defaultValue={staff.primaryArea?.active ? staff.primaryAreaId ?? "" : ""}>
              <option value="">None</option>
              {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
            </select>
          </Field>
        </div>
        {staff.primaryArea && !staff.primaryArea.active ? <Badge tone="amber">Inactive primary area retained: {staff.primaryArea.name}</Badge> : null}
        <Field label="Secondary areas">
          <select className={inputClass} name="secondaryAreaIds" defaultValue={staff.secondaryAreas.filter((area) => area.active).map((area) => area.id)} multiple>
            {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
          </select>
        </Field>
        {inactiveSecondaryAreas.length ? <p className="text-xs font-semibold text-amber-800">Inactive retained: {inactiveSecondaryAreas.join(", ")}</p> : null}
        <Field label="Skills">
          <select className={inputClass} name="skillIds" defaultValue={staff.skills.filter((skill) => skill.active).map((skill) => skill.id)} multiple>
            {skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
          </select>
        </Field>
        {inactiveSkills.length ? <p className="text-xs font-semibold text-amber-800">Inactive retained: {inactiveSkills.join(", ")}</p> : null}
        <Field label="Certifications">
          <select className={inputClass} name="certificationIds" defaultValue={staff.certifications.filter((certification) => certification.active).map((certification) => certification.id)} multiple>
            {certifications.map((certification) => <option key={certification.id} value={certification.id}>{certification.name}</option>)}
          </select>
        </Field>
        {inactiveCertifications.length ? <p className="text-xs font-semibold text-amber-800">Inactive retained: {inactiveCertifications.join(", ")}</p> : null}
        <Field label="Assignment visibility">
          <input className={inputClass} name="availabilityNotes" defaultValue={staff.availabilityNotes ?? ""} />
        </Field>
        <Field label="Certification notes">
          <input className={inputClass} name="statusCertification" defaultValue={staff.statusCertification ?? ""} />
        </Field>
        <button className={buttonClass} type="submit">Save staff</button>
      </form>
    </AppShell>
  );
}
