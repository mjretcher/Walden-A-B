import { Download } from "lucide-react";
import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { buildStaffScheduleRows, staffScheduleColumns } from "@/lib/staff-schedule-report";
import { StaffScheduleAutoRefresh } from "./auto-refresh";

export default async function StaffScheduleReport() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const { session, rows } = await buildStaffScheduleRows();

  return (
    <AppShell user={user}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-forest-900">Staff A/B Schedule View</h1>
          <p className="mt-1 text-slate-600">Alphabetical live staff assignment grid for {session?.name ?? "the active session"}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StaffScheduleAutoRefresh />
          <a className={secondaryButtonClass} href="/api/exports/staff-schedule?format=csv"><Download className="h-4 w-4" />CSV</a>
          <a className={secondaryButtonClass} href="/api/exports/staff-schedule?format=xlsx"><Download className="h-4 w-4" />XLSX</a>
        </div>
      </div>

      <section className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-soft">
        <table className="w-full min-w-[1180px] table-fixed border-collapse text-sm">
          <thead>
            <tr className="bg-forest-900 text-left text-white">
              {staffScheduleColumns.map((column, index) => (
                <th key={column} className={`${index === 0 ? "sticky left-0 z-10 w-52 bg-forest-900" : ""} p-3 text-left align-top`}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
                <tr key={`${row.Staff}-${rowIndex}`} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/60">
                  {staffScheduleColumns.map((column, columnIndex) => (
                    <td key={column} className={`${columnIndex === 0 ? "sticky left-0 z-10 w-52 bg-inherit font-black text-slate-950" : "border-l border-slate-100"} break-words p-3 align-top text-sm leading-snug`}>
                      {row[column]}
                    </td>
                  ))}
                </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p className="p-6 text-sm font-bold text-slate-500">No active staff found.</p> : null}
      </section>

      <p className="mt-4 text-sm font-medium text-slate-500">
        <Badge tone="blue">Live view</Badge> Updates automatically every few seconds — no refresh needed.
      </p>
    </AppShell>
  );
}
