import clsx from "clsx";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
  backHref,
  backLabel = "Back"
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-3xl">
        {backHref ? (
          <Link href={backHref} className="no-print mb-2 inline-flex items-center gap-1 text-xs font-bold text-lake-700 transition hover:text-lake-900">
            <ArrowLeft className="h-3.5 w-3.5" />{backLabel}
          </Link>
        ) : null}
        {eyebrow ? <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{eyebrow}</p> : null}
        <h1 className="mt-1 text-3xl font-black leading-tight text-forest-900 md:text-[2.05rem]">{title}</h1>
        {description ? <p className="mt-1 text-sm leading-6 text-slate-600 md:text-base">{description}</p> : null}
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
    warning: "border-amber-200 bg-amber-50 text-amber-900"
  };

  return (
    <div className={clsx("rounded-xl border p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-panel", tones[tone])}>
      <div className="flex items-start justify-between gap-3 md:block">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
        <p className="text-2xl font-black leading-none md:mt-3 md:text-3xl">{value}</p>
      </div>
      {detail ? <p className="mt-2 text-xs font-medium text-slate-500 md:text-sm">{detail}</p> : null}
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

  return <span className={clsx("inline-flex items-center rounded-md px-2.5 py-1 text-xs font-black uppercase", tones[tone])}>{children}</span>;
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
  "min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-lake-500 focus:ring-2 focus:ring-lake-100";

export const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-lake-600 px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-lake-700 disabled:cursor-not-allowed disabled:opacity-50";

export const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 shadow-sm transition hover:border-lake-200 hover:bg-lake-50";

export const dangerButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-black text-red-700 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50";

export const subtlePanelClass = "rounded-xl border border-slate-200 bg-slate-50/80 p-4";

export const panelClass = "rounded-xl border border-slate-200/80 bg-white p-5 shadow-soft";

export const rowButtonClass =
  "rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-lake-200 hover:bg-lake-50/40";

export function Panel({
  children,
  className,
  id
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return <section id={id} className={clsx(panelClass, className)}>{children}</section>;
}

export function SectionHeader({
  title,
  detail,
  eyebrow,
  description,
  children
}: {
  title: string;
  detail?: string;
  eyebrow?: string;
  description?: string;
  children?: React.ReactNode;
}) {
  const helperText = description ?? detail;

  return (
    <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {eyebrow ? <p className="text-xs font-bold uppercase tracking-[0.18em] text-lake-700">{eyebrow}</p> : null}
        <h2 className="text-lg font-black text-forest-900">{title}</h2>
        {helperText ? <p className="mt-1 text-sm text-slate-500">{helperText}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white/80 p-8 text-center">
      <p className="text-lg font-semibold text-forest-900">{title}</p>
      <p className="mt-2 text-sm text-slate-500">{body}</p>
    </div>
  );
}
