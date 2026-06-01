import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge, Field, PageHeader, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createArea, createCertification, createSkill, toggleArea, toggleCertification, toggleSkill } from "./actions";

type StructureSearchParams = {
  area?: string | string[];
  skill?: string | string[];
  certification?: string | string[];
};

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function statusBadge(active: boolean) {
  return active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>;
}

export default async function CampStructurePage({ searchParams }: { searchParams?: Promise<StructureSearchParams> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const params = searchParams ? await searchParams : {};
  const areaSearch = firstParam(params.area).trim();
  const skillSearch = firstParam(params.skill).trim();
  const certificationSearch = firstParam(params.certification).trim();

  const [areas, skills, certifications] = await Promise.all([
    prisma.area.findMany({
      where: areaSearch ? { name: { contains: areaSearch, mode: "insensitive" } } : undefined,
      include: { _count: { select: { activities: true, primaryStaff: true, secondaryStaff: true } } },
      orderBy: [{ active: "desc" }, { name: "asc" }]
    }),
    prisma.skill.findMany({
      where: skillSearch ? { name: { contains: skillSearch, mode: "insensitive" } } : undefined,
      include: { _count: { select: { staff: true, activities: true } } },
      orderBy: [{ active: "desc" }, { name: "asc" }]
    }),
    prisma.certification.findMany({
      where: certificationSearch ? { name: { contains: certificationSearch, mode: "insensitive" } } : undefined,
      include: { _count: { select: { staff: true, activities: true } } },
      orderBy: [{ active: "desc" }, { name: "asc" }]
    })
  ]);

  return (
    <AppShell user={user}>
      <PageHeader title="Camp Structure" eyebrow="Areas, skills, and certifications" />

      <form className="mb-6 grid gap-4 rounded-lg border border-white bg-white p-5 shadow-soft lg:grid-cols-3" method="get">
        <Field label="Search Areas">
          <input className={inputClass} name="area" defaultValue={areaSearch} />
        </Field>
        <Field label="Search Skills">
          <input className={inputClass} name="skill" defaultValue={skillSearch} />
        </Field>
        <Field label="Search Certifications">
          <input className={inputClass} name="certification" defaultValue={certificationSearch} />
        </Field>
        <div className="flex flex-wrap gap-2 lg:col-span-3">
          <button className={buttonClass} type="submit">Search</button>
          <a className={secondaryButtonClass} href="/admin/structure">Clear</a>
        </div>
      </form>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-lg border border-white bg-white p-5 shadow-soft">
          <h2 className="text-lg font-bold text-forest-900">Areas</h2>
          <form action={createArea} className="mt-4 grid gap-3">
            <Field label="Area name">
              <input className={inputClass} name="name" required />
            </Field>
            <Field label="Description">
              <input className={inputClass} name="description" />
            </Field>
            <button className={buttonClass} type="submit">Add Area</button>
          </form>
          <div className="mt-5 space-y-3">
            {areas.map((area) => (
              <div key={area.id} className="rounded-md border border-slate-100 bg-paper/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-forest-900">{area.name}</p>
                    {area.description ? <p className="mt-1 text-sm text-slate-500">{area.description}</p> : null}
                    <p className="mt-2 text-xs text-slate-500">
                      {area._count.activities} activities / {area._count.primaryStaff + area._count.secondaryStaff} staff links
                    </p>
                  </div>
                  {statusBadge(area.active)}
                </div>
                <form action={toggleArea} className="mt-3">
                  <input name="id" type="hidden" value={area.id} />
                  <input name="active" type="hidden" value={String(area.active)} />
                  <button className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold">
                    {area.active ? "Deactivate" : "Activate"}
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-white bg-white p-5 shadow-soft">
          <h2 className="text-lg font-bold text-forest-900">Skills</h2>
          <form action={createSkill} className="mt-4 grid gap-3">
            <Field label="Skill name">
              <input className={inputClass} name="name" required />
            </Field>
            <button className={buttonClass} type="submit">Add Skill</button>
          </form>
          <div className="mt-5 space-y-3">
            {skills.map((skill) => (
              <div key={skill.id} className="rounded-md border border-slate-100 bg-paper/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-forest-900">{skill.name}</p>
                    <p className="mt-2 text-xs text-slate-500">{skill._count.staff} staff / {skill._count.activities} activities</p>
                  </div>
                  {statusBadge(skill.active)}
                </div>
                <form action={toggleSkill} className="mt-3">
                  <input name="id" type="hidden" value={skill.id} />
                  <input name="active" type="hidden" value={String(skill.active)} />
                  <button className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold">
                    {skill.active ? "Deactivate" : "Activate"}
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-white bg-white p-5 shadow-soft">
          <h2 className="text-lg font-bold text-forest-900">Certifications</h2>
          <form action={createCertification} className="mt-4 grid gap-3">
            <Field label="Certification name">
              <input className={inputClass} name="name" required />
            </Field>
            <button className={buttonClass} type="submit">Add Certification</button>
          </form>
          <div className="mt-5 space-y-3">
            {certifications.map((certification) => (
              <div key={certification.id} className="rounded-md border border-slate-100 bg-paper/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-forest-900">{certification.name}</p>
                    <p className="mt-2 text-xs text-slate-500">{certification._count.staff} staff / {certification._count.activities} activities</p>
                  </div>
                  {statusBadge(certification.active)}
                </div>
                <form action={toggleCertification} className="mt-3">
                  <input name="id" type="hidden" value={certification.id} />
                  <input name="active" type="hidden" value={String(certification.active)} />
                  <button className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold">
                    {certification.active ? "Deactivate" : "Activate"}
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
