import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge, PageHeader, Panel, SectionHeader, buttonClass, inputClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
        {query.length >= 2 ? <p className="mt-3 text-sm font-medium text-slate-600">Results will appear here as search categories are enabled.</p> : null}
      </Panel>
    </AppShell>
  );
}
