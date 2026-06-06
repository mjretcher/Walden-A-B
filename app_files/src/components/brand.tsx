import clsx from "clsx";

export function PineWaveMark({ className, mode = "light" }: { className?: string; mode?: "light" | "dark" }) {
  const pine = mode === "light" ? "text-white" : "text-forest-900";
  const wave = mode === "light" ? "text-lake-100" : "text-lake-600";

  return (
    <svg className={clsx("shrink-0", className)} viewBox="0 0 96 80" fill="none" aria-hidden="true">
      <g className={pine} fill="currentColor">
        <path d="M39.5 4 27.6 23.4h7L22.5 41.6h8.3L16 63h47L48.2 41.6h8.3L44.4 23.4h7L39.5 4Z" />
        <path d="M39.5 53h5.8v15h-5.8V53Z" />
        <path d="M68 16 58.6 31.4h5.6l-9.7 14.5h6.7L50.7 62H86L75.5 45.9h6.7l-9.7-14.5h5.6L68 16Z" opacity=".72" />
        <path d="M68 55h4.6v12H68V55Z" opacity=".72" />
        <path d="M18 22 10.7 34.2h4.4L7.5 45.8h5.2L4 60h27.8l-8.7-14.2h5.2l-7.6-11.6h4.4L18 22Z" opacity=".68" />
        <path d="M18 52h3.8v10H18V52Z" opacity=".68" />
      </g>
      <path className={wave} d="M8 70c7-5 14-5 21 0s14 5 21 0 14-5 21 0 12 5 18 1" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path className={wave} d="M8 77c7-4 14-4 21 0s14 4 21 0 14-4 21 0 12 4 18 1" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".75" />
    </svg>
  );
}

export function CampWaldenLogo({
  className,
  markClassName,
  stacked = false,
  mode = "light",
  subtitle = "A/B OPERATIONS"
}: {
  className?: string;
  markClassName?: string;
  stacked?: boolean;
  mode?: "light" | "dark";
  subtitle?: string;
}) {
  return (
    <div className={clsx("flex items-center gap-3", stacked && "items-start", className)}>
      <PineWaveMark className={clsx(stacked ? "h-14 w-16" : "h-11 w-14", markClassName)} mode={mode} />
      <div className="leading-none">
        <p className={clsx("font-serif text-2xl font-black uppercase tracking-wide", mode === "light" ? "text-white" : "text-forest-900")}>Camp</p>
        <p className={clsx("-mt-0.5 font-serif text-2xl font-black uppercase tracking-wide", mode === "light" ? "text-white" : "text-forest-900")}>Walden</p>
        <p className={clsx("mt-2 text-[0.68rem] font-black uppercase tracking-[0.22em]", mode === "light" ? "text-forest-100" : "text-lake-700")}>{subtitle}</p>
      </div>
    </div>
  );
}
