"use client";

export function PrintDashboardButton() {
  return (
    <button
      className="inline-flex min-h-11 items-center justify-center rounded-md bg-forest-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest-900"
      onClick={() => window.print()}
      type="button"
    >
      Print morning brief
    </button>
  );
}
