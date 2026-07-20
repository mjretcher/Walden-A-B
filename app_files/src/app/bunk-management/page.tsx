import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireBunkManagementAccess } from "@/lib/auth";

export default async function BunkManagementHubPage() {
  const user = await requireBunkManagementAccess("read");
  const isExecAdmin = user.role === UserRole.EXECUTIVE_ADMIN;

  const tools = [
    {
      title: "Assignment Board",
      description: "Drag staff and CAs onto cabins for the current session. The main day-to-day tool — no more spreadsheet, no more retyping.",
      href: "/bunk-management/board",
      action: "Open board",
      adminOnly: true
    },
    {
      title: "Mess Hall Seating",
      description: "Drag cabins or campers onto mess hall tables. Reads the live roster, tracks seats per table, and saves one shared chart for the session.",
      href: "/bunk-management/mess-hall",
      action: "Open seating",
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
      title: "Out of Cabin",
      description: "Pick which unassigned staff print under the OUT OF CABIN designation on the sheets — staff sheet, cabin sheets, or both.",
      href: "/bunk-management/out-of-cabin",
      action: "Choose staff",
      adminOnly: true
    },
    {
      title: "Cabin Print Order",
      description: "Hand-set the order cabins print in on the sheets, per unit — paper goes by camper age, not cabin name. Units you never touch keep their automatic order.",
      href: "/bunk-management/cabin-order",
      action: "Set print order",
      adminOnly: true
    },
    {
      title: "Print / Export",
      description: "The full cabin roster, styled to match the paper \"Q# [Boys/Girls] Cabins\" sheets — this is what Girls Side Head and Boys Side Head accounts see.",
      href: "/bunk-management/print",
      action: "Open print view",
      adminOnly: false
    },
    {
      title: "Staff Sheet (Print)",
      description: "Staff-only version of the cabin sheets -- no campers. One print job: all boys cabins on page 1, all girls on page 2.",
      href: "/bunk-management/print-staff",
      action: "Open staff sheet",
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
