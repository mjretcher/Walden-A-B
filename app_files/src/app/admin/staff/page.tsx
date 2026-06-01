import { Prisma, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge, EmptyState, PageHeader, inputClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, UNIT_LABEL } from "@/lib/periods";

type StaffSearchParams = {
  q?: string | string[];
  area?: string | string[];
  cabin?: string | string[];
  certification?: string | string[];
  skill?: string | string[];
};

type FilterOption = {
  value: string;
  label: string;
};

const noCabinValue = "__NO_CABIN__";

function asArray(value?: string | string[]) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function FilterPills({ name, label, options, selected }: { name: string; label: string; options: FilterOption[]; selected: string[] }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-bold text-forest-900">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <label key={option.value} className="cursor-pointer">
              <input className="peer sr-only" defaultChecked={isSelected} name={name} type="checkbox" value={option.value} />
              <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition peer-checked:border-forest-700 peer-checked:bg-forest-700 peer-checked:text-white hover:border-lake-300">
                {option.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export default async function StaffManagementPage({ searchParams }: { searchParams?: Promise<StaffSearchParams> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const params = searchParams ? await searchParams : {};
  const search = firstParam(params.q)?.trim() ?? "";
  const selectedAreas = asArray(params.area);
  const selectedCabins = asArray(params.cabin);
  const selectedCertifications = asArray(params.certification);
  const selectedSkills = asArray(params.skill);
  const session = await prisma.session.findFirst({ where: { active: true } });

  const [areas, cabins, certifications, skills] = await Promise.all([
    prisma.area.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.cabin.findMany({ orderBy: [{ unit: "asc" }, { name: "asc" }] }),
    prisma.certification.findMany({ orderBy: { name: "asc" } }),
    prisma.skill.findMany({ orderBy: { name: "asc" } })
  ]);

  const staffWhere: Prisma.StaffWhereInput = { active: true };
  const andFilters: Prisma.StaffWhereInput[] = [];

  if (search) {
    andFilters.push({
      OR: [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } }
      ]
    });
  }

  if (selectedAreas.length) {
    andFilters.push({
      OR: [
        { primaryAreaId: { in: selectedAreas } },
        { secondaryAreas: { some: { id: { in: selectedAreas } } } },
        { assignments: { some: { offering: { areaId: { in: selectedAreas } } } } }
      ]
    });
  }

  if (selectedCabins.length) {
    const realCabinIds = selectedCabins.filter((id) => id !== noCabinValue);
    const cabinFilters: Prisma.StaffWhereInput[] = [];
    if (realCabinIds.length) cabinFilters.push({ cabinId: { in: realCabinIds } });
    if (selectedCabins.includes(noCabinValue)) cabinFilters.push({ cabinId: null });
    if (cabinFilters.length) andFilters.push({ OR: cabinFilters });
  }

  if (selectedCertifications.length) andFilters.push({ certifications: { some: { id: { in: selectedCertifications } } } });
  if (selectedSkills.length) andFilters.push({ skills: { some: { id: { in: selectedSkills } } } });
  if (andFilters.length) staffWhere.AND = andFilters;

  const staff = await prisma.staff.findMany({
    where: staffWhere,
    include: {
      cabin: true,
      primaryArea: true,
      secondaryAreas: true,
      certifications: true,
      skills: true,
      assignments: {
        where: session ? { sessionId: session.id } : undefined,
        include: { offering: { include: { activity: true, area: true } } },
        orderBy: { period: "asc" }
      }
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
  });

  const areaOptions = areas.map((area) => ({ value: area.id, label: area.name }));
  const cabinOptions = [
    { value: noCabinValue, label: "No cabin" },
    ...cabins.map((cabin) => ({ value: cabin.id, label: `${cabin.name} - ${UNIT_LABEL[cabin.unit]}` }))
  ];
  const certificationOptions = certifications.map((certification) => ({ value: certification.id, label: certification.name }));
  const skillOptions = skills.map((skill) => ({ value: skill.id, label: skill.name }));

  return (
    <AppShell user={user}>
      <PageHeader title="Staff Management" eyebrow={session?.name ?? "No active session"} />

      <form className="mb-6 grid gap-5 rounded-lg border border-white bg-white p-5 shadow-soft" method="get">
        <label className="grid gap-1.5 text-sm font-bold text-forest-900">
          Search staff name
          <input className={inputClass} defaultValue={search} name="q" placeholder="First or last name" />
        </label>

        <div className="grid gap-5 xl:grid-cols-2">
          <FilterPills label="Area" name="area" options={areaOptions} selected={selectedAreas} />
          <FilterPills label="Cabin" name="cabin" options={cabinOptions} selected={selectedCabins} />
          <FilterPills label="Certifications" name="certification" options={certificationOptions} selected={selectedCertifications} />
          <FilterPills label="Skills" name="skill" options={skillOptions} selected={selectedSkills} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-forest-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest-900" type="submit">
            Apply filters
          </button>
          <a className={secondaryButtonClass} href="/admin/staff">Reset</a>
          <p className="text-sm font-medium text-slate-500">Showing {staff.length} active staff member{staff.length === 1 ? "" : "s"}.</p>
        </div>
      </form>

      {!session ? <EmptyState title="No active session" body="Activate a session before reviewing staff assignments." /> : null}

      {staff.length ? (
        <section className="grid gap-4">
          {staff.map((person) => (
            <article key={person.id} className="rounded-lg border border-white bg-white p-4 shadow-soft">
              <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold text-forest-900">{person.firstName} {person.lastName}</h2>
                    {person.primaryArea ? <Badge tone="blue">{person.primaryArea.name}</Badge> : <Badge>No primary area</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    Cabin {person.cabin?.name ?? "-"} - Availability: {person.sessionAvailability || "Not specified"}
                  </p>
                  {person.statusCertification ? <p className="mt-2 text-sm font-semibold text-slate-700">Status/certification notes: {person.statusCertification}</p> : null}
                  {person.availabilityNotes ? <p className="mt-1 text-sm text-slate-600">{person.availabilityNotes}</p> : null}
                </div>

                <div className="grid gap-2 text-sm lg:min-w-80">
                  <div className="rounded-md border border-slate-200 bg-white p-3">
                    <p className="font-bold text-forest-900">Secondary areas</p>
                    <p className="mt-1 text-slate-600">{person.secondaryAreas.map((area) => area.name).join(", ") || "None listed"}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-white p-3">
                    <p className="font-bold text-forest-900">Certifications</p>
                    <p className="mt-1 text-slate-600">{person.certifications.map((certification) => certification.name).join(", ") || "None listed"}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-white p-3">
                    <p className="font-bold text-forest-900">Skills</p>
                    <p className="mt-1 text-slate-600">{person.skills.map((skill) => skill.name).join(", ") || "None listed"}</p>
                  </div>
                </div>
              </div>

              <details className="mt-4 rounded-md border border-slate-100 bg-slate-50/70 p-3">
                <summary className="cursor-pointer text-sm font-bold text-forest-900">Current assignment schedule</summary>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  {person.assignments.length ? person.assignments.map((assignment) => (
                    <div key={assignment.id} className="rounded-md border border-slate-200 bg-white p-3 text-sm">
                      <p className="font-bold text-slate-950">{PERIOD_LABEL[assignment.period]} - {assignment.offering.activity.name}</p>
                      <p className="mt-1 text-slate-600">{assignment.offering.area.name}</p>
                      <p className="mt-1 text-slate-500">Role: {assignment.role || "Staff"}</p>
                    </div>
                  )) : <p className="text-sm text-slate-500">No assignments for the active session.</p>}
                </div>
              </details>
            </article>
          ))}
        </section>
      ) : (
        <EmptyState title="No staff match these filters" body="Try removing a filter, or import staff for the active session." />
      )}
    </AppShell>
  );
}
