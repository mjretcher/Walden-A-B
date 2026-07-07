import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireBunkManagementAccess } from "@/lib/auth";

export default async function BunkManagementHubPage() {
  const user = await requireBunkManagementAccess("read");
  const isExecAdmin = user.role === UserRole.EXECUTIVE_ADMIN;

  const tools = [
    {
      title: "Import from CampMinder",
      description: "Upload the hand-typed cabin sheet to sync camper cabin assignments for the active session. Campers only — staff go through the Assignment Board.",
      href: "/bunk-management/import",
      action: "Open import",
      adminOnly: true
    },
    {
      title: "Assignment Board",
      description: "Drag staff and CAs onto cabins for the current session. The main day-to-day tool — no more spreadsheet, no more retyping.",
      href: "/bunk-management/board",
      action: "Open board",
      adminOnly: true
    },
    {
      title: "Cabins, Units & Beds",
      description: "Rename cabins, move them between units, and set bed counts in real time.",
      href: "/bunk-management/cabins",
      action: "Open cabin admin",
      adminOnly: true
    },
    {
      title: "Staff Housing",
      description: "Non-cabin staff housing — Nurse Cabin, Staff House, and similar — kept separate from real bunk assignment.",
      href: "/bunk-management/staff-housing",
      action: "Open staff housing",
      adminOnly: true
    },
    {
      title: "Print / Export",
      description: "The full cabin roster, styled to match the paper \"Q# [Boys/Girls] Cabins\" sheets — this is what Girls Side Head and Boys Side Head accounts see.",
      href: "/bunk-management/print",
      action: "Open print view",
      adminOnly: false
    }
  ].filter((tool) => isExecAdmin || !tool.adminOnly);

  return (
    <AppShell user={user}>
      <PageHeader
        title="Bunk Management"
        eyebrow="Camper and staff cabin assignment"
        backHref="/dashboard"
        backLabel="Back to Dashboard"
        description={
          isExecAdmin
            ? "The source of truth for cabin assignments, camp-wide. Exec-admin only for editing; Girls Side Head and Boys Side Head have full read access to the print view for their side."
            : "Read-only view of cabin assignments for your side of camp."
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        {tools.map((tool) => (
          <section key={tool.href} className="rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
            <h2 className="text-lg font-black text-forest-900">{tool.title}</h2>
            <p className="mt-2 min-h-16 text-sm leading-6 text-slate-500">{tool.description}</p>
            <div className="mt-4">
              <a className={secondaryButtonClass} href={tool.href}>{tool.action}</a>
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
