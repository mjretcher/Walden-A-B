// @ts-nocheck
import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { findSwitchWindowMismatches, repairSwitchWindows } from "./actions";

export default async function SwitchWindowRepairPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const fixes = await findSwitchWindowMismatches();

  return (
    <AppShell user={user}>
      <PageHeader
        title="Switch Window Repair"
        eyebrow="One-time cleanup for switches approved before the window fix"
        backHref="/admin/data-center"
        backLabel="Data Center"
      />

      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
        <p className="text-sm font-semibold text-slate-700">
          Switch approvals used to save the new class without a registration window, so it defaulted to Q1. On a Q3
          switch that left the camper&rsquo;s old class removed and the new one invisible — which is why the period
          printed blank on their card. New switches are fixed; this repairs the ones already approved.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Only switch-created registrations are considered, and only where the class the switch replaced proves which
          window it should have been. Anything without that evidence is left untouched.
        </p>
      </div>

      {!fixes.length ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-soft">
          <p className="text-sm font-black text-forest-900">Nothing to repair.</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            No switch-created registration is sitting in the wrong window.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-soft">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
            <span className="text-sm font-black text-forest-900">
              {fixes.length} registration{fixes.length !== 1 ? "s" : ""} to fix
            </span>
            <form action={repairSwitchWindows} className="ml-auto">
              <button
                className="rounded-lg bg-forest-700 px-4 py-2 text-sm font-black text-white transition hover:bg-forest-800"
                type="submit"
              >
                Repair {fixes.length} registration{fixes.length !== 1 ? "s" : ""}
              </button>
            </form>
          </div>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-left text-xs font-black uppercase tracking-wide text-slate-600">
                <th className="p-3">Camper</th>
                <th className="p-3">Period</th>
                <th className="p-3">Class</th>
                <th className="p-3">Now</th>
                <th className="p-3">Will become</th>
              </tr>
            </thead>
            <tbody>
              {fixes.map((fix) => (
                <tr className="border-t border-slate-100" key={fix.registrationId}>
                  <td className="p-3 font-black text-slate-800">{fix.camperName}</td>
                  <td className="p-3 font-semibold text-slate-600">{fix.period}</td>
                  <td className="p-3 font-semibold text-slate-600">{fix.activityName}</td>
                  <td className="p-3">
                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-black text-red-700">{fix.currentWindow}</span>
                  </td>
                  <td className="p-3">
                    <span className="rounded bg-forest-100 px-2 py-0.5 text-xs font-black text-forest-800">{fix.correctWindow}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
