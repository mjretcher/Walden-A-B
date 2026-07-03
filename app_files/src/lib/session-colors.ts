// Preset session colors used to make it obvious at a glance which session
// (e.g. Q1 vs Q2) someone is looking at or editing. Classes are written out
// in full (never built with string interpolation) so Tailwind's JIT scanner
// picks them up at build time.
export const SESSION_COLOR_KEYS = ["forest", "teal", "amber", "lake", "purple", "rose"] as const;
export type SessionColorKey = (typeof SESSION_COLOR_KEYS)[number];

export const SESSION_COLOR_LABEL: Record<SessionColorKey, string> = {
  forest: "Green",
  teal: "Teal",
  amber: "Amber",
  lake: "Blue",
  purple: "Purple",
  rose: "Rose"
};

type SessionColorClasses = {
  strip: string; // solid top strip
  dot: string; // small identity dot
  chip: string; // badge/pill background + text
  chipText: string;
  band: string; // sticky "editing X" band background
  bandBorder: string; // left accent border on the band
  bandText: string;
};

const SESSION_COLOR_CLASSES: Record<SessionColorKey, SessionColorClasses> = {
  forest: {
    strip: "bg-forest-500",
    dot: "bg-forest-500",
    chip: "bg-forest-50",
    chipText: "text-forest-800",
    band: "bg-forest-50",
    bandBorder: "border-forest-500",
    bandText: "text-forest-800"
  },
  teal: {
    strip: "bg-teal-500",
    dot: "bg-teal-500",
    chip: "bg-teal-50",
    chipText: "text-teal-800",
    band: "bg-teal-50",
    bandBorder: "border-teal-500",
    bandText: "text-teal-800"
  },
  amber: {
    strip: "bg-amber-500",
    dot: "bg-amber-500",
    chip: "bg-amber-50",
    chipText: "text-amber-800",
    band: "bg-amber-50",
    bandBorder: "border-amber-500",
    bandText: "text-amber-800"
  },
  lake: {
    strip: "bg-lake-500",
    dot: "bg-lake-500",
    chip: "bg-lake-50",
    chipText: "text-lake-700",
    band: "bg-lake-50",
    bandBorder: "border-lake-500",
    bandText: "text-lake-700"
  },
  purple: {
    strip: "bg-purple-500",
    dot: "bg-purple-500",
    chip: "bg-purple-50",
    chipText: "text-purple-800",
    band: "bg-purple-50",
    bandBorder: "border-purple-500",
    bandText: "text-purple-800"
  },
  rose: {
    strip: "bg-rose-500",
    dot: "bg-rose-500",
    chip: "bg-rose-50",
    chipText: "text-rose-800",
    band: "bg-rose-50",
    bandBorder: "border-rose-500",
    bandText: "text-rose-800"
  }
};

export function sessionColorClasses(color: string | null | undefined): SessionColorClasses {
  const key = (SESSION_COLOR_KEYS as readonly string[]).includes(color ?? "") ? (color as SessionColorKey) : "forest";
  return SESSION_COLOR_CLASSES[key];
}

// Deterministic default so a brand-new session gets a color that's visibly
// different from whatever came before it, without requiring anyone to pick
// one manually. Admins can still override it in Camp Structure > Sessions.
export function nextDefaultSessionColor(existingSessionCount: number): SessionColorKey {
  return SESSION_COLOR_KEYS[existingSessionCount % SESSION_COLOR_KEYS.length];
}
