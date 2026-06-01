import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge, Field, PageHeader, buttonClass, inputClass } from "@/components/ui";
import { roleLabel } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createUser, toggleUser } from "./actions";

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
            {Object.values(UserRole).map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
          </select>
        </Field>
        <Field label="Area">
          <select className={inputClass} name="areaId">
            <option value="">None</option>
            {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
          </select>
        </Field>
        <Field label="Password"><input className={inputClass} name="password" defaultValue="walden2025!" /></Field>
        <button className={`${buttonClass} xl:col-span-5`} type="submit">Create user</button>
      </form>

      <section className="rounded-lg border border-white bg-white p-5 shadow-soft">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr className="border-b">
              <th className="py-3">Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Area</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="py-3 font-semibold">{row.name}</td>
                <td>{row.email}</td>
                <td>{roleLabel(row.role)}</td>
                <td>{row.area?.name ?? "-"}</td>
                <td>{row.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</td>
                <td>
                  <form action={toggleUser}>
                    <input name="id" type="hidden" value={row.id} />
                    <input name="active" type="hidden" value={String(row.active)} />
                    <button className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold">{row.active ? "Disable" : "Enable"}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
