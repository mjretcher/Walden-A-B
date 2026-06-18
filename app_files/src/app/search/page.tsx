import Link from "next/link";
import { RegistrationStatus, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge, PageHeader, Panel, SectionHeader, buttonClass, inputClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

type SearchParams = {
  q?: string | string[];
};

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function GlobalSearchPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD, UserRole.COUNSELOR]);
  const params = searchParams ? await searchParams : {};
  const query = firstParam(params.q)?.trim() ?? "";
  const session = await prisma.session.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } });
  const safeQuery = query.length >= 2 ? query : "";
  const [campers, staff] = safeQuery && session
    ? await Promise.all([
        prisma.camper.findMany({
          where: {
            sessionId: session.id,
            active: true,
            OR: [
              { firstName: { contains: safeQuery, mode: "insensitive" } },
              { lastName: { contains: safeQuery, mode: "insensitive" } },
              { cabin: { name: { contains: safeQuery, mode: "insensitive" } } }
            ]
          },
          include: {
            cabin: true,
            registrations: { where: { status: { in: activeRegistration } }, select: { id: true } }
          },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          take: 15
        }),
        prisma.staff.findMany({
          where: {
            active: true,
            OR: [
              { firstName: { contains: safeQuery, mode: "insensitive" } },
              { lastName: { contains: safeQuery, mode: "insensitive" } },
              { primaryArea: { name: { contains: safeQuery, mode: "insensitive" } } },
              { housingLabel: { contains: safeQuery, mode: "insensitive" } },
              { cabin: { name: { contains: safeQuery, mode: "insensitive" } } }
            ]
          },
          include: {
            primaryArea: true,
            cabin: true,
            assignments: { where: { sessionId: session.id }, select: { id: true } }
          },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          take: 15
        })
      ])
    : [[], []];
  const totalResults = campers.length + staff.length;

  return (
    <AppShell user={user}>
      <PageHeader title="Global Search" eyebrow={session?.name ?? "No active session"}>
        <Badge tone="blue">Operations command search</Badge>
      </PageHeader>

      <Panel className="border-lake-200 bg-lake-50/60">
        <SectionHeader title="Search everything" description="Start with a camper, staff member, activity, area, or cabin name." />
        <form className="flex flex-col gap-3 sm:flex-row" method="get">
          <input autoFocus className={`${inputClass} flex-1 bg-white`} defaultValue={query} name="q" placeholder="Search camper, staff, activity, area, or cabin" />
          <button className={buttonClass} type="submit">Search</button>
        </form>
        {query && query.length < 2 ? <p className="mt-3 text-sm font-medium text-amber-800">Type at least 2 characters to search.</p> : null}
        {safeQuery ? <p className="mt-3 text-sm font-medium text-slate-600">Showing {totalResults} result{totalResults === 1 ? "" : "s"} for “{safeQuery}”.</p> : null}
      </Panel>

      {safeQuery ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <Panel>
            <SectionHeader title="Campers" description="Active campers matching name or cabin.">
              <Badge>{campers.length}</Badge>
            </SectionHeader>
            <div className="grid gap-3">
              {campers.map((camper) => (
                <Link key={camper.id} className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-lake-200 hover:bg-lake-50/40" href={`/admin/campers?q=${encodeURIComponent(`${camper.firstName} ${camper.lastName}`)}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-forest-900">{camper.firstName} {camper.lastName}</p>
                      <p className="text-sm text-slate-500">{camper.cabin?.name ?? "No cabin"} · {camper.registrations.length} active registration{camper.registrations.length === 1 ? "" : "s"}</p>
                    </div>
                    {camper.medicalFlags ? <Badge tone="amber">Medical flag</Badge> : null}
                  </div>
                </Link>
              ))}
              {!campers.length ? <p className="text-sm font-medium text-slate-500">No campers found.</p> : null}
            </div>
          </Panel>

          <Panel>
            <SectionHeader title="Staff" description="Active staff matching name, area, or cabin.">
              <Badge>{staff.length}</Badge>
            </SectionHeader>
            <div className="grid gap-3">
              {staff.map((person) => (
                <Link key={person.id} className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-lake-200 hover:bg-lake-50/40" href={`/admin/staff/${person.id}`}>
                  <p className="font-bold text-forest-900">{person.firstName} {person.lastName}</p>
                  <p className="text-sm text-slate-500">{person.primaryArea?.name ?? "No primary area"} · {person.housingLabel ?? person.cabin?.name ?? "No cabin"} · {person.assignments.length} assignment{person.assignments.length === 1 ? "" : "s"}</p>
                </Link>
              ))}
              {!staff.length ? <p className="text-sm font-medium text-slate-500">No staff found.</p> : null}
            </div>
          </Panel>
        </div>
      ) : null}
    </AppShell>
  );
}
