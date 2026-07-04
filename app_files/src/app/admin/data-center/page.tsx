import Link from "next/link";
import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";

const cards = [
  {
    title: "Import Campers",
    href: "/admin/import/campers",
    body: "Upload camper exports, update cabins and demographics, and preserve Walden-owned data like swim levels and registrations."
  },
  {
    title: "Import Staff",
    href: "/admin/import/staff",
    body: "Upload staff directory exports and update staff records without changing schedules or assignments."
  },
  {
    title: "Q1 Cabin Sync",
    href: "/admin/import/q1-cabins",
    body: "One-time bulk update of Q1 cabin assignments for all campers and staff from the latest Q1 cabin sheets. Preview every change before applying."
  },
  {
    title: "Q2 Cabin Sync",
    href: "/admin/import/q2-cabins",
    body: "One-time bulk update of Q2 cabin assignments for all campers and staff (including CAs now housed with campers) from the latest Q2 cabin sheets. Preview every change before applying."
  },
  {
    title: "Camp Structure",
    href: "/admin/structure",
    body: "Manage areas, skills, and certifications used by staff, activities, and assignment warnings."
  }
];

export default async function DataCenterPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);

  return (
    <AppShell user={user}>
      <PageHeader title="Data Center" eyebrow="Imports and camp data administration" />

      <div className="mb-6 rounded-lg border border-lake-100 bg-lake-50 p-4 text-sm font-medium text-lake-800">
        Use this as the admin entry point for CampMinder/Webpoint exports. Imports should update source data while preserving Walden-owned information such as swim levels, registrations, attendance, and manual staff edits.
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="rounded-lg border border-white bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg">
            <h2 className="text-lg font-bold text-forest-900">{card.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{card.body}</p>
          </Link>
        ))}
      </section>

      <section className="mt-6 rounded-lg border border-white bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold text-forest-900">Import rules</h2>
        <div className="mt-3 grid gap-3 text-sm text-slate-700 md:grid-cols-2">
          <div className="rounded-md bg-paper p-3">
            <p className="font-semibold text-forest-900">Campers</p>
            <p className="mt-1">Match by name, gender, and verification fields when no CampMinder ID exists. Preserve swim levels, registrations, attendance, and notes.</p>
          </div>
          <div className="rounded-md bg-paper p-3">
            <p className="font-semibold text-forest-900">Staff</p>
            <p className="mt-1">Match by email when available, otherwise by name. Activity reports should add skills and planning labels, not restrict assignments.</p>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
