import Link from "next/link";
import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge, Field, PageHeader, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createStaff } from "./actions";

type StaffSearchParams = {
  q?: string | string[];
};

const availabilityOptions = [
  "All 7 Weeks",
  "Arrives Late",
  "Leaves Early",
  "Custom Dates"
];

const defaultHousingLabels = ["Staff House", "Nurse Cabin", "Health Center", "Out of Cabin", "Office", "Leadership House"];

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function staffName(staff: { firstName: string; lastName: string }) {
  return `${staff.firstName} ${staff.lastName}`;
}

function shortDate(date?: Date | null) {
  return date ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date) : "";
}

function availabilitySummary(staff: { sessionAvailability: string | null; employmentStart: Date | null; employmentEnd: Date | null }) {
  const type = staff.sessionAvailability || "All 7 Weeks";
  const dates = [staff.employmentStart ? `Arrives ${shortDate(staff.employmentStart)}` : "", staff.employmentEnd ? `Leaves ${shortDate(staff.employmentEnd)}` : ""].filter(Boolean);
  return dates.length ? `${type} • ${dates.join(" • ")}` : type;
}

function housingName(staff: { housingLabel: string | null; cabin?: { name: string } | null }) {
  return staff.housingLabel ?? staff.cabin?.name ?? "No cabin";
}

async function loadStaff(query: string, sessionId?: string) {
  return prisma.staff.findMany({
    where: query
      ? {
          OR: [
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { primaryArea: { name: { contains: query, mode: "insensitive" } } },
            { housingLabel: { contains: query, mode: "insensitive" } },
            { cabin: { name: { contains: query, mode: "insensitive" } } }
          ]
        }
      : undefined,
    include: {
      cabin: true,
      primaryArea: true,
      certifications: { orderBy: { name: "asc" } },
      assignments: sessionId ? { where: { sessionId }, select: { id: true } } : { select: { id: true } }
    },
    orderBy: [{ active: "desc" }, { lastName: "asc" }, { firstName: "asc" }]
  });
}

export default async function StaffManagementPage({ searchParams }: { searchParams?: Promise<StaffSearchParams> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const params = searchParams ? await searchParams : {};
  const query = firstParam(params.q).trim();
  const session = await prisma.session.findFirst({ where: { active: true } });
  const [staff, areas, certifications, cabins] = await Promise.all([
    loadStaff(query, session?.id),
    prisma.area.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.certification.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.cabin.findMany({ orderBy: [{ unit: "asc" }, { name: "asc" }] })
  ]);
  const housingOptions = Array.from(new Set([...defaultHousingLabels, ...staff.map((person) => person.housingLabel).filter(Boolean) as string[]])).sort();

  return (
    <AppShell user={user}>
      <PageHeader title="Staff Management" eyebrow="Staff profiles">
        <Link className={secondaryButtonClass} href="/bunk-management/staff-housing">Staff Housing</Link>
        <Link className={secondaryButtonClass} href="/bunk-management/board">Cabin Assignments</Link>
      </PageHeader>

      <form className="mb-6 flex flex-col gap-3 rounded-lg border border-white bg-white p-5 shadow-soft md:flex-row" method="get">
        <Field label="Staff search">
          <input className={inputClass} name="q" defaultValue={query} placeholder="Search name, area, cabin, or housing..." />
        </Field>
        <div className="flex items-end gap-2">
          <button className={buttonClass} type="submit">Search</button>
          <Link className={secondaryButtonClass} href="/admin/staff">Clear</Link>
        </div>
      </form>

      <details className="mb-6 rounded-lg border border-white bg-white p-5 shadow-soft">
        <summary className="cursor-pointer list-none text-lg font-black text-forest-900">Add Staff Member</summary>
        <datalist id="staff-housing-options">
          {housingOptions.map((label) => <option key={label} value={label} />)}
        </datalist>
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
          <Field label="Availability type">
            <select className={inputClass} name="sessionAvailability" defaultValue="All 7 Weeks">
              {availabilityOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </Field>
          <Field label="Certifications">
            <select className={inputClass} name="certificationIds" multiple>
              {certifications.map((certification) => <option key={certification.id} value={certification.id}>{certification.name}</option>)}
            </select>
          </Field>
          <Field label="Cabin assignment">
            <select className={inputClass} name="cabinId" defaultValue="">
              <option value="">None</option>
              {cabins.map((cabin) => <option key={cabin.id} value={cabin.id}>{cabin.name}</option>)}
            </select>
          </Field>
          <Field label="Or custom staff housing">
            <input className={inputClass} list="staff-housing-options" name="housingLabel" placeholder="Staff House" />
          </Field>
          <Field label="Arrival date">
            <input className={inputClass} name="employmentStart" type="date" />
          </Field>
          <Field label="Departure date">
            <input className={inputClass} name="employmentEnd" type="date" />
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

      <div className="grid gap-3">
        {staff.map((row) => (
          <article key={row.id} className="rounded-lg border border-white bg-white p-4 shadow-soft">
            <div className="grid gap-3 lg:grid-cols-[1.1fr_1fr_auto] lg:items-center">
              <div>
                <h2 className="text-lg font-bold text-forest-900">{staffName(row)}</h2>
                <p className="mt-1 text-sm text-slate-600">{housingName(row)} / {row.primaryArea?.name ?? "No primary area"}</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">{availabilitySummary(row)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {row.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
                <Badge tone={row.assignments.length ? "blue" : "neutral"}>{row.assignments.length} assignments</Badge>
                {row.certifications.length ? row.certifications.slice(0, 4).map((certification) => <Badge key={certification.id} tone="amber">{certification.name}</Badge>) : <Badge>No certs</Badge>}
                {row.certifications.length > 4 ? <Badge>+{row.certifications.length - 4}</Badge> : null}
              </div>
              <Link className={secondaryButtonClass} href={`/admin/staff/${row.id}`}>Edit / View</Link>
            </div>
          </article>
        ))}
        {!staff.length ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-soft">
            No staff match this search.
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
