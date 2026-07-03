import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge, Field, PageHeader, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { activateSession, copyCampersToSession, copyMenuToSession, createArea, createCertification, createSession, createSkill, toggleArea, toggleCertification, toggleSkill, updateActiveSession, updateCertification, updateCertificationActivityLinks } from "./actions";
import { ActivityAbbreviationsEditor } from "./activity-abbreviations-editor";
import { SESSION_COLOR_KEYS, SESSION_COLOR_LABEL, sessionColorClasses } from "@/lib/session-colors";
import { ConfirmSubmitButton, SubmitButton } from "@/components/confirm-submit-button";

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

  const [allSessions, areas, skills, certifications, activities] = await Promise.all([
    prisma.session.findMany({
      orderBy: [{ year: "desc" }, { createdAt: "desc" }],
      include: { _count: { select: { campers: true, menus: true } } }
    }),
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

  const activeSession = allSessions.find((s) => s.active) ?? null;
  const activitiesByArea = (activities as any[]).reduce<Record<string, any[]>>((groups, activity) => {
    groups[activity.area.name] = groups[activity.area.name] ?? [];
    groups[activity.area.name].push(activity);
    return groups;
  }, {});

  function dateLabel(date?: Date | null) {
    return date ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date) : null;
  }

  return (
    <AppShell user={user}>
      <PageHeader title="Camp Structure" eyebrow="Sessions, areas, staff experience labels, and certifications" />

      <div className="mb-6 rounded-lg border border-lake-100 bg-lake-50 p-4 text-sm font-medium text-lake-800">
        Areas group camp programs. Activities/classes are built in Menu. Staff experience labels describe what staff can help teach or cover; they are planning labels, not camper classes by themselves.
      </div>

      {/* ── SESSION MANAGEMENT ────────────────────────────────────────── */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
        <h2 className="text-lg font-black text-forest-900">Sessions</h2>
        <p className="mt-1 text-sm text-slate-500">All historical sessions are preserved forever. Switch the active session to change what the whole app operates on. Campers, registrations, scream session, menus, and switches are all session-scoped — nothing is lost when you start a new one.</p>

        {/* All sessions list */}
        <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {allSessions.map((session) => {
            const start = dateLabel(session.startsAt);
            const end = dateLabel(session.endsAt);
            return (
              <div key={session.id} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${session.active ? "bg-forest-50" : ""}`}>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${sessionColorClasses(session.color).dot}`} aria-hidden="true" />
                    <span className="font-black text-forest-900">{session.name}</span>
                    <span className="text-sm text-slate-500">Summer {session.year}</span>
                    {session.active && <Badge tone="green">Active</Badge>}
                  </div>
                  {(start || end) && (
                    <p className="mt-0.5 text-xs text-slate-500">{start ?? "?"} – {end ?? "?"}</p>
                  )}
                  {session.notes && <p className="mt-0.5 text-xs text-slate-400">{session.notes}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!session.active && (
                    <form action={activateSession}>
                      <input name="id" type="hidden" value={session.id} />
                      <ConfirmSubmitButton
                        className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-forest-800 hover:bg-forest-50"
                        confirmMessage={`Make "${session.name}" the active session? Every signed-in user will immediately switch to it — search, outages, rosters, and registration all follow.`}
                      >
                        Switch to this session
                      </ConfirmSubmitButton>
                    </form>
                  )}
                  {activeSession && !session.active && (
                    activeSession._count.menus > 0 ? (
                      <Badge tone="green">Menu already copied</Badge>
                    ) : (
                      <form action={copyMenuToSession}>
                        <input name="sourceSessionId" type="hidden" value={session.id} />
                        <input name="targetSessionId" type="hidden" value={activeSession.id} />
                        <ConfirmSubmitButton
                          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                          confirmMessage={`Copy ${session.name}'s menu into ${activeSession.name}? This is one-time only.`}
                        >
                          Copy this menu → active session
                        </ConfirmSubmitButton>
                      </form>
                    )
                  )}
                  {activeSession && !session.active && (
                    activeSession._count.campers > 0 ? (
                      <Badge tone="green">Campers already copied</Badge>
                    ) : (
                      <form action={copyCampersToSession}>
                        <input name="sourceSessionId" type="hidden" value={session.id} />
                        <input name="targetSessionId" type="hidden" value={activeSession.id} />
                        <ConfirmSubmitButton
                          className="rounded-md border border-lake-200 bg-lake-50 px-3 py-1.5 text-xs font-black text-lake-800 hover:bg-lake-100 disabled:opacity-60"
                          confirmMessage={`Copy ${session.name}'s campers into ${activeSession.name}? This is one-time only.`}
                        >
                          Copy campers → active session
                        </ConfirmSubmitButton>
                      </form>
                    )
                  )}
                </div>
              </div>
            );
          })}
          {allSessions.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-500">No sessions yet. Create one below.</p>
          )}
        </div>

        {/* Copy menu from active → any other session that doesn't have a menu yet */}
        {activeSession && allSessions.filter((s) => !s.active && s._count.menus === 0).length > 0 && (
          <div className="mt-4 rounded-lg border border-lake-200 bg-lake-50 p-4">
            <p className="text-sm font-black text-lake-900">Copy active menu to another session</p>
            <p className="mt-1 text-xs text-slate-500">One-time copy. Use this to seed a new session with the current menu structure before switching to it. Once a session has a menu, this can&rsquo;t be re-run for it — edit that session&rsquo;s menu directly instead.</p>
            <form action={copyMenuToSession} className="mt-3 flex flex-wrap items-end gap-3">
              <input name="sourceSessionId" type="hidden" value={activeSession.id} />
              <Field label="Copy to session">
                <select className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" name="targetSessionId">
                  {allSessions.filter((s) => !s.active && s._count.menus === 0).map((s) => (
                    <option key={s.id} value={s.id}>{s.name} — Summer {s.year}</option>
                  ))}
                </select>
              </Field>
              <SubmitButton className={buttonClass}>Copy menu</SubmitButton>
            </form>
          </div>
        )}

        {/* Copy campers from active → any other session that doesn't have campers yet */}
        {activeSession && allSessions.filter((s) => !s.active && s._count.campers === 0).length > 0 && (
          <div className="mt-4 rounded-lg border border-lake-200 bg-lake-50 p-4">
            <p className="text-sm font-black text-lake-900">Copy active roster to another session</p>
            <p className="mt-1 text-xs text-slate-500">
              One-time copy only. Creates a fresh camper list in the target session, including current cabins as a
              starting point. After this runs, the two sessions are fully independent — cabin changes in one never
              affect the other, and this action can't be re-run once the target session has campers.
            </p>
            <form action={copyCampersToSession} className="mt-3 flex flex-wrap items-end gap-3">
              <input name="sourceSessionId" type="hidden" value={activeSession.id} />
              <Field label="Copy to session">
                <select className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" name="targetSessionId">
                  {allSessions.filter((s) => !s.active && s._count.campers === 0).map((s) => (
                    <option key={s.id} value={s.id}>{s.name} — Summer {s.year}</option>
                  ))}
                </select>
              </Field>
              <SubmitButton className={buttonClass}>Copy campers</SubmitButton>
            </form>
          </div>
        )}

        {/* Edit active session */}
        {activeSession && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-black text-lake-700">Edit active session details</summary>
            <form action={updateActiveSession} className="mt-4 grid gap-4 lg:grid-cols-5">
              <input name="id" type="hidden" value={activeSession.id} />
              <Field label="Session name">
                <input className={inputClass} name="name" defaultValue={activeSession.name} required />
              </Field>
              <Field label="Year">
                <input className={inputClass} name="year" type="number" defaultValue={activeSession.year} required />
              </Field>
              <Field label="Cycle / label">
                <input className={inputClass} name="cycle" defaultValue={activeSession.cycle} />
              </Field>
              <Field label="Color">
                <select className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" name="color" defaultValue={activeSession.color}>
                  {SESSION_COLOR_KEYS.map((key) => (
                    <option key={key} value={key}>{SESSION_COLOR_LABEL[key]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Start date">
                <input className={inputClass} name="startsAt" type="date" defaultValue={activeSession.startsAt ? activeSession.startsAt.toISOString().slice(0, 10) : ""} />
              </Field>
              <Field label="End date">
                <input className={inputClass} name="endsAt" type="date" defaultValue={activeSession.endsAt ? activeSession.endsAt.toISOString().slice(0, 10) : ""} />
              </Field>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700 lg:col-span-4">
                <span>Notes</span>
                <input className={inputClass} name="notes" defaultValue={activeSession.notes ?? ""} />
              </label>
              <div className="flex items-end">
                <SubmitButton className={buttonClass}>Update</SubmitButton>
              </div>
            </form>
          </details>
        )}

        {/* Create new session */}
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-black text-forest-700">+ Create new session</summary>
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
            ⚠️ Creating a new session will make it the active session immediately. The current session and all its data are preserved — use &ldquo;Switch to this session&rdquo; above to return to it anytime.
          </div>
          <form action={createSession} className="mt-4 grid gap-4 lg:grid-cols-5">
            <Field label="Session name">
              <input className={inputClass} name="name" placeholder="e.g. Q2 2026" required />
            </Field>
            <Field label="Year">
              <input className={inputClass} name="year" type="number" defaultValue={new Date().getFullYear()} required />
            </Field>
            <Field label="Cycle / label">
              <input className={inputClass} name="cycle" placeholder="e.g. Q2" />
            </Field>
            <Field label="Start date">
              <input className={inputClass} name="startsAt" type="date" />
            </Field>
            <Field label="End date">
              <input className={inputClass} name="endsAt" type="date" />
            </Field>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700 lg:col-span-4">
              <span>Notes</span>
              <input className={inputClass} name="notes" placeholder="Optional notes about this session" />
            </label>
            <div className="flex items-end">
              <ConfirmSubmitButton
                className="rounded-lg bg-forest-800 px-4 py-2 text-sm font-black text-white hover:bg-forest-700"
                confirmMessage="Create this session and make it active immediately? Every signed-in user will switch to it."
              >
                Create session
              </ConfirmSubmitButton>
            </div>
          </form>
        </details>
      </section>

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

      <ActivityAbbreviationsEditor
        activities={(activities as Array<{ id: string; name: string; abbreviation: string | null; area: { name: string } }>).map((activity) => ({
          id: activity.id,
          name: activity.name,
          area: activity.area.name,
          abbreviation: activity.abbreviation ?? null
        }))}
      />

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
