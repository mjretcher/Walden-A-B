import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge, Field, PageHeader, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createArea, createCertification, createSkill, toggleArea, toggleCertification, toggleSkill, updateActiveSession, updateActivityAbbreviations, updateCertification, updateCertificationActivityLinks } from "./actions";

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

  const [session, areas, skills, certifications, activities] = await Promise.all([
    prisma.session.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } }),
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
      include: { activities: { include: { area: true }, orderBy: [{ area: { name: "asc" } }, { name: "asc" }] }, _count: { select: { staff: true, activities: true } } },
      orderBy: [{ active: "desc" }, { name: "asc" }]
    }),
    prisma.activity.findMany({
      where: { active: true, area: { active: true } },
      include: { area: true },
      orderBy: [{ area: { name: "asc" } }, { name: "asc" }]
    })
  ]);
  const activitiesByArea = (activities as any[]).reduce<Record<string, any[]>>((groups, activity) => {
    groups[activity.area.name] = groups[activity.area.name] ?? [];
    groups[activity.area.name].push(activity);
    return groups;
  }, {});

  return (
    <AppShell user={user}>
      <PageHeader title="Camp Structure" eyebrow="Areas, staff experience labels, and certifications" />

      <div className="mb-6 rounded-lg border border-lake-100 bg-lake-50 p-4 text-sm font-medium text-lake-800">
        Areas group camp programs. Activities/classes are built in Menu. Staff experience labels describe what staff can help teach or cover; they are planning labels, not camper classes by themselves.
      </div>

      {session ? (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
          <h2 className="text-lg font-black text-forest-900">Active Session Display</h2>
          <p className="mt-1 text-sm text-slate-500">This controls the session/year text shown on dashboards, registration, exports, and cards.</p>
          <form action={updateActiveSession} className="mt-4 grid gap-4 lg:grid-cols-5">
            <input name="id" type="hidden" value={session.id} />
            <Field label="Session name">
              <input className={inputClass} name="name" defaultValue={session.name} required />
            </Field>
            <Field label="Year">
              <input className={inputClass} name="year" type="number" defaultValue={session.year} required />
            </Field>
            <Field label="Cycle / label">
              <input className={inputClass} name="cycle" defaultValue={session.cycle} />
            </Field>
            <Field label="Start date">
              <input className={inputClass} name="startsAt" type="date" defaultValue={session.startsAt ? session.startsAt.toISOString().slice(0, 10) : ""} />
            </Field>
            <Field label="End date">
              <input className={inputClass} name="endsAt" type="date" defaultValue={session.endsAt ? session.endsAt.toISOString().slice(0, 10) : ""} />
            </Field>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700 lg:col-span-4">
              <span>Notes</span>
              <input className={inputClass} name="notes" defaultValue={session.notes ?? ""} />
            </label>
            <div className="flex items-end">
              <button className={buttonClass} type="submit">Update Session</button>
            </div>
          </form>
        </section>
      ) : null}

      <form className="mb-6 grid gap-4 rounded-lg border border-white bg-white p-5 shadow-soft lg:grid-cols-3" method="get">
        <Field label="Search Areas">
          <input className={inputClass} name="area" defaultValue={areaSearch} />
        </Field>
        <Field label="Search Staff Experience">
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

      {/* Activity Abbreviations — bulk-edit short codes that appear on staff
        * schedules (live view, print, CSV/XLSX). One field per activity; blank
        * keeps the full name. */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-forest-900">Activity Abbreviations</h2>
            <p className="mt-1 text-sm text-slate-500">Short codes used on staff schedules (live view, print, exports). For example, set <span className="font-black">Stand Up Paddleboard</span> to <span className="font-black">SUP</span>. Leave blank to keep the full activity name. Camper-facing views (rosters, menus, cards) always show the full name.</p>
          </div>
        </div>
        <form action={updateActivityAbbreviations}>
          <div className="space-y-4">
            {Object.entries(activitiesByArea).map(([areaName, areaActivities]) => (
              <div key={areaName} className="rounded-md border border-slate-100 bg-paper/40 p-3">
                <p className="mb-2 text-[0.72rem] font-black uppercase tracking-wider text-slate-500">{areaName}</p>
                <div className="grid gap-x-4 gap-y-2 md:grid-cols-2 xl:grid-cols-3">
                  {areaActivities.map((activity) => (
                    <label key={activity.id} className="flex items-center gap-2 text-sm">
                      <input name="activityId" type="hidden" value={activity.id} />
                      <span className="min-w-0 flex-1 truncate font-bold text-slate-700" title={activity.name}>{activity.name}</span>
                      <input
                        className={`${inputClass} w-24 flex-none text-center font-black uppercase tracking-wider`}
                        defaultValue={activity.abbreviation ?? ""}
                        maxLength={8}
                        name="abbreviation"
                        placeholder="—"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-slate-500">Abbreviations apply to every period this activity runs. Period 5A/5B at the lake will still show <span className="font-black">TUBE</span> regardless of the Ski abbreviation.</p>
            <button className={buttonClass} type="submit">Save Abbreviations</button>
          </div>
        </form>
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-lg border border-white bg-white p-5 shadow-soft">
          <h2 className="text-lg font-bold text-forest-900">Areas</h2>
          <p className="mt-1 text-sm text-slate-500">Broad program groups like Waterfront, Athletics, Arts, or Tripping.</p>
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
                      {area._count.activities} activities/classes / {area._count.primaryStaff + area._count.secondaryStaff} staff links
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
          <h2 className="text-lg font-bold text-forest-900">Staff Experience</h2>
          <p className="mt-1 text-sm text-slate-500">Teaching/coverage labels imported from staff reports or added manually. These are not the camper-facing class schedule.</p>
          <form action={createSkill} className="mt-4 grid gap-3">
            <Field label="Experience label">
              <input className={inputClass} name="name" required placeholder="Example: Waterskiing, Tennis, Ceramics" />
            </Field>
            <button className={buttonClass} type="submit">Add Experience Label</button>
          </form>
          <div className="mt-5 space-y-3">
            {skills.map((skill) => (
              <div key={skill.id} className="rounded-md border border-slate-100 bg-paper/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-forest-900">{skill.name}</p>
                    <p className="mt-2 text-xs text-slate-500">{skill._count.staff} staff / {skill._count.activities} activity requirement links</p>
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
          <p className="mt-1 text-sm text-slate-500">Formal qualifications like Lifeguard, CPR, First Aid, or boating certifications. Link them to classes so Scream Session can warn when assigned staff are missing a required cert.</p>
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
                  <div className="min-w-0 flex-1">
                    <form action={updateCertification} className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <input name="id" type="hidden" value={certification.id} />
                      <label className="grid gap-1 text-sm font-medium text-slate-700">
                        <span className="sr-only">Certification name</span>
                        <input className={inputClass} name="name" defaultValue={certification.name} required />
                      </label>
                      <button className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold" type="submit">Save name</button>
                    </form>
                    <p className="mt-2 text-xs text-slate-500">{certification._count.staff} staff / {certification._count.activities} activity requirement links</p>
                  </div>
                  {statusBadge(certification.active)}
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-black text-lake-700">Class requirements</summary>
                  <form action={updateCertificationActivityLinks} className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-white p-3">
                    <input name="id" type="hidden" value={certification.id} />
                    {Object.entries(activitiesByArea).map(([areaName, areaActivities]: [string, any[]]) => (
                      <div key={areaName}>
                        <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">{areaName}</p>
                        <div className="flex flex-wrap gap-2">
                          {areaActivities.map((activity) => {
                            const checked = certification.activities.some((linked) => linked.id === activity.id);
                            return (
                              <label key={activity.id} className="cursor-pointer">
                                <input className="peer sr-only" name="activityIds" type="checkbox" value={activity.id} defaultChecked={checked} />
                                <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 transition peer-checked:border-lake-700 peer-checked:bg-lake-700 peer-checked:text-white hover:border-lake-300">{activity.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <button className={buttonClass} type="submit">Save class links</button>
                  </form>
                </details>
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
