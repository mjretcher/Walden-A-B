import clsx from "clsx";

export function PageHeader({
  eyebrow,
  title,
  children
}: {
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow ? <p className="text-sm font-semibold uppercase tracking-wide text-lake-700">{eyebrow}</p> : null}
        <h1 className="mt-1 text-3xl font-bold text-forest-900 md:text-4xl">{title}</h1>
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  tone = "forest",
  detail
}: {
  label: string;
  value: string | number;
  tone?: "forest" | "lake" | "bark" | "warning";
  detail?: string;
}) {
  const tones = {
    forest: "border-forest-100 bg-white text-forest-900",
    lake: "border-lake-100 bg-white text-lake-700",
    bark: "border-orange-100 bg-white text-bark",
    warning: "border-amber-200 bg-amber-50 text-amber-800"
  };

  return (
    <div className={clsx("rounded-lg border p-5 shadow-soft", tones[tone])}>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      {detail ? <p className="mt-2 text-sm text-slate-500">{detail}</p> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral"
}: {
  children: React.ReactNode;
  tone?: "neutral" | "green" | "blue" | "amber" | "red";
}) {
  const tones = {
    neutral: "bg-slate-100 text-slate-700",
    green: "bg-forest-100 text-forest-700",
    blue: "bg-lake-100 text-lake-700",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-700"
  };

  return <span className={clsx("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", tones[tone])}>{children}</span>;
}

export function CapacityPill({
  count,
  limit,
  limitType
}: {
  count: number;
  limit?: number | null;
  limitType?: string;
}) {
  if (limitType === "UNLIMITED") return <Badge tone="blue">Unlimited</Badge>;
  if (!limit) return <Badge tone="amber">Approval</Badge>;
  if (count > limit) return <Badge tone="red">{count} / {limit}</Badge>;
  if (count === limit) return <Badge tone="amber">{count} / {limit}</Badge>;
  return <Badge tone="green">{count} / {limit}</Badge>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "min-h-11 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-lake-500 focus:ring-2 focus:ring-lake-100";

export const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-forest-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest-900 disabled:cursor-not-allowed disabled:opacity-50";

export const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-forest-800 transition hover:border-forest-200 hover:bg-forest-50";

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 p-8 text-center">
      <p className="text-lg font-semibold text-forest-900">{title}</p>
      <p className="mt-2 text-sm text-slate-500">{body}</p>
    </div>
  );
}
