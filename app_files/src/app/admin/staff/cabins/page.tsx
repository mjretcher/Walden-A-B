import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge, PageHeader, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateStaffCabin } from "../actions";

function staffName(staff: { firstName: string; lastName: string }) {
  return `${staff.firstName} ${staff.lastName}`;
}

export default async function StaffCabinAssignmentsPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const [cabins, staff] = await Promise.all([
    prisma.cabin.findMany({ orderBy: [{ unit: "asc" }, { name: "asc" }] }),
    prisma.staff.findMany({
      where: { active: true },
      include: { cabin: true, primaryArea: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
    })
  ]);
  const customHousingLabels = Array.from(new Set(staff.map((person) => person.housingLabel).filter(Boolean) as string[])).sort();
  const columns = [
    ...cabins.map((cabin) => ({ id: cabin.id, name: cabin.name, staff: staff.filter((person) => person.cabinId === cabin.id && !person.housingLabel) })),
    ...customHousingLabels.map((label) => ({ id: `custom-${label}`, name: label, staff: staff.filter((person) => person.housingLabel === label) })),
    { id: "", name: "Unassigned", staff: staff.filter((person) => !person.cabinId && !person.housingLabel) }
  ];

  return (
    <AppShell user={user}>
      <PageHeader
        title="Staff Cabin Assignments"
        eyebrow="Staff only"
        description="Move staff between real cabins or custom staff-only housing without touching camper cabin assignments."
      >
        <a className={secondaryButtonClass} href="/admin/staff">Back to Staff Management</a>
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-4">
        {columns.map((column) => (
          <section key={column.id || "unassigned"} className="rounded-xl border border-slate-200 bg-white p-4 shadow-soft">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-black text-forest-900">{column.name}</h2>
              <Badge>{column.staff.length} staff</Badge>
            </div>
            <div className="grid gap-3">
              {column.staff.map((person) => (
                <article key={person.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="font-black text-slate-950">{staffName(person)}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{person.primaryArea?.name ?? "No primary area"}</p>
                  <form action={updateStaffCabin} className="mt-3 grid gap-2">
                    <input name="staffId" type="hidden" value={person.id} />
                    <select className={inputClass} name="cabinId" defaultValue={person.cabinId ?? ""}>
                      <option value="">Unassigned</option>
                      {cabins.map((cabin) => <option key={cabin.id} value={cabin.id}>{cabin.name}</option>)}
                    </select>
                    <input className={inputClass} name="housingLabel" defaultValue={person.housingLabel ?? ""} placeholder="Or custom staff housing" />
                    <button className={buttonClass} type="submit">Move staff</button>
                  </form>
                </article>
              ))}
              {!column.staff.length ? <p className="rounded-lg border border-dashed border-slate-200 p-3 text-sm font-semibold text-slate-500">No staff in this column.</p> : null}
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
