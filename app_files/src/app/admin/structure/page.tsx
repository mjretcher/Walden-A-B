import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge, PageHeader, inputClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createStaffArea, createStaffCertification, createStaffSkill } from "../staff/actions";

export default async function CampStructurePage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const [areas, skills, certifications] = await Promise.all([
    prisma.area.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
    prisma.skill.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
    prisma.certification.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] })
  ]);

  return (
    <AppShell user={user}>
      <PageHeader title="Camp Structure" eyebrow="Admin settings for areas, skills, and certifications" />

      <section className="mb-6 grid gap-4 rounded-lg border border-white bg-white p-5 shadow-soft lg:grid-cols-3">
        <form action={createStaffArea} className="grid gap-2">
          <label className="grid gap-1.5 text-sm font-bold text-forest-900">
            Add area
            <input className={inputClass} name="name" placeholder="Example: Waterfront, STEM, Video" />
          </label>
          <button className="inline-flex min-h-11 w-fit items-center justify-center rounded-md bg-forest-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest-900" type="submit">Add area</button>
        </form>
        <form action={createStaffSkill} className="grid gap-2">
          <label className="grid gap-1.5 text-sm font-bold text-forest-900">
            Add skill
            <input className={inputClass} name="name" placeholder="Example: Wakeboard, Video, Tennis" />
          </label>
          <button className="inline-flex min-h-11 w-fit items-center justify-center rounded-md bg-forest-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest-900" type="submit">Add skill</button>
        </form>
        <form action={createStaffCertification} className="grid gap-2">
          <label className="grid gap-1.5 text-sm font-bold text-forest-900">
            Add certification
            <input className={inputClass} name="name" placeholder="Example: Lifeguard, CPR, First Aid" />
          </label>
          <button className="inline-flex min-h-11 w-fit items-center justify-center rounded-md bg-forest-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest-900" type="submit">Add certification</button>
        </form>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-white bg-white p-5 shadow-soft">
          <h2 className="text-lg font-bold text-forest-900">Areas</h2>
          <div className="mt-3 grid gap-2">
            {areas.map((area) => <div key={area.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"><span>{area.name}</span><Badge tone={area.active ? "green" : "neutral"}>{area.active ? "Active" : "Inactive"}</Badge></div>)}
          </div>
        </div>
        <div className="rounded-lg border border-white bg-white p-5 shadow-soft">
          <h2 className="text-lg font-bold text-forest-900">Skills</h2>
          <div className="mt-3 grid gap-2">
            {skills.map((skill) => <div key={skill.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"><span>{skill.name}</span><Badge tone={skill.active ? "green" : "neutral"}>{skill.active ? "Active" : "Inactive"}</Badge></div>)}
          </div>
        </div>
        <div className="rounded-lg border border-white bg-white p-5 shadow-soft">
          <h2 className="text-lg font-bold text-forest-900">Certifications</h2>
          <div className="mt-3 grid gap-2">
            {certifications.map((certification) => <div key={certification.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"><span>{certification.name}</span><Badge tone={certification.active ? "green" : "neutral"}>{certification.active ? "Active" : "Inactive"}</Badge></div>)}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
