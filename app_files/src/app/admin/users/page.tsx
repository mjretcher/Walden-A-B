import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge, Field, PageHeader, buttonClass, inputClass } from "@/components/ui";
import { roleLabel } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createUser, updateUser } from "./actions";

export default async function UsersPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const [users, areas] = await Promise.all([
    prisma.user.findMany({ include: { area: true }, orderBy: [{ role: "asc" }, { name: "asc" }] }),
    prisma.area.findMany({ where: { active: true }, orderBy: { name: "asc" } })
  ]);

  return (
    <AppShell user={user}>
      <PageHeader title="Users" eyebrow="Role-based access" />

      <form action={createUser} className="mb-6 grid gap-4 rounded-lg border border-white bg-white p-5 shadow-soft md:grid-cols-2 xl:grid-cols-5">
        <Field label="Name"><input className={inputClass} name="name" required /></Field>
        <Field label="Email"><input className={inputClass} name="email" type="email" required /></Field>
        <Field label="Role">
          <select className={inputClass} name="role">
            {(Object.values(UserRole) as string[]).map((role) => <option key={role} value={role}>{roleLabel(role as any)}</option>)}
          </select>
        </Field>
        <Field label="Area">
          <select className={inputClass} name="areaId">
            <option value="">None</option>
            {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
          </select>
        </Field>
        <Field label="Password"><input className={inputClass} name="password" type="password" autoComplete="new-password" minLength={8} required /></Field>
        <button className={`${buttonClass} xl:col-span-5`} type="submit">Create user</button>
      </form>

      <section className="grid gap-3 rounded-lg border border-white bg-white p-5 shadow-soft">
        {users.map((row) => (
          <form key={row.id} action={updateUser} className="grid gap-3 rounded-lg border border-slate-200 bg-paper p-4 xl:grid-cols-[1fr_1.25fr_0.85fr_0.85fr_0.8fr_1fr_auto]">
            <input name="id" type="hidden" value={row.id} />
            <Field label="Name"><input className={inputClass} name="name" defaultValue={row.name} required /></Field>
            <Field label="Email"><input className={inputClass} name="email" type="email" defaultValue={row.email} required /></Field>
            <Field label="Role">
              <select className={inputClass} name="role" defaultValue={row.role}>
                {(Object.values(UserRole) as string[]).map((role) => <option key={role} value={role}>{roleLabel(role as any)}</option>)}
              </select>
            </Field>
            <Field label="Area">
              <select className={inputClass} name="areaId" defaultValue={row.areaId ?? ""}>
                <option value="">None</option>
                {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <label className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-700">
                <input name="active" type="checkbox" defaultChecked={row.active} />
                {row.active ? "Active" : "Inactive"}
              </label>
            </Field>
            <Field label="New password"><input className={inputClass} name="password" type="password" autoComplete="new-password" minLength={8} placeholder="Leave unchanged" /></Field>
            <div className="flex items-end gap-2">
              {row.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
              <button className={buttonClass} type="submit">Save</button>
            </div>
          </form>
        ))}
      </section>
    </AppShell>
  );
}
