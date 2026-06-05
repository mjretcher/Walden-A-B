import type { ComponentType, SVGProps } from "react";
import clsx from "clsx";
import {
  BadgeCheck,
  Bean,
  Bike,
  Brush,
  Camera,
  CircleDot,
  Disc3,
  Drama,
  Drum,
  Dumbbell,
  Fish,
  Flame,
  Footprints,
  Gamepad2,
  Gem,
  Goal,
  Headphones,
  Image,
  Laugh,
  Leaf,
  MapPinned,
  Music,
  Origami,
  Palette,
  PawPrint,
  PersonStanding,
  Radio,
  Sailboat,
  Scissors,
  Shell,
  Sparkles,
  Sprout,
  Tent,
  TentTree,
  Theater,
  TreePine,
  Trophy,
  Video,
  Volleyball,
  Waves
} from "lucide-react";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

type IconRule = {
  matches: string[];
  icon: IconComponent;
};

type AreaTheme = {
  tile: string;
  icon: string;
  soft: string;
};

const areaThemes: Record<string, AreaTheme> = {
  waterfront: {
    tile: "border-lake-200 bg-lake-50 text-lake-800",
    icon: "text-lake-800",
    soft: "bg-lake-50 text-lake-800"
  },
  athletics: {
    tile: "border-emerald-200 bg-emerald-50 text-emerald-800",
    icon: "text-emerald-800",
    soft: "bg-emerald-50 text-emerald-800"
  },
  fitness: {
    tile: "border-cyan-200 bg-cyan-50 text-cyan-800",
    icon: "text-cyan-800",
    soft: "bg-cyan-50 text-cyan-800"
  },
  riding: {
    tile: "border-amber-200 bg-amber-50 text-amber-800",
    icon: "text-amber-800",
    soft: "bg-amber-50 text-amber-800"
  },
  "arts & crafts": {
    tile: "border-rose-200 bg-rose-50 text-rose-800",
    icon: "text-rose-800",
    soft: "bg-rose-50 text-rose-800"
  },
  "performing arts": {
    tile: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800",
    icon: "text-fuchsia-800",
    soft: "bg-fuchsia-50 text-fuchsia-800"
  },
  "media & tech": {
    tile: "border-indigo-200 bg-indigo-50 text-indigo-800",
    icon: "text-indigo-800",
    soft: "bg-indigo-50 text-indigo-800"
  },
  nature: {
    tile: "border-forest-200 bg-forest-50 text-forest-800",
    icon: "text-forest-800",
    soft: "bg-forest-50 text-forest-800"
  }
};

const defaultTheme: AreaTheme = {
  tile: "border-slate-200 bg-slate-50 text-slate-700",
  icon: "text-slate-700",
  soft: "bg-slate-50 text-slate-700"
};

const activityRules: IconRule[] = [
  { matches: ["water-ski", "waterski", "ski"], icon: WaterSkiIcon },
  { matches: ["kayak"], icon: KayakIcon },
  { matches: ["stand up paddle", "paddle board", "sup"], icon: PaddleBoardIcon },
  { matches: ["tube"], icon: TubeIcon },
  { matches: ["sailing"], icon: Sailboat },
  { matches: ["fishing"], icon: Fish },
  { matches: ["blue gill", "bluegill", "swim instruction", "lap swim", "swim"], icon: Waves },
  { matches: ["canoe"], icon: KayakIcon },
  { matches: ["archery"], icon: Goal },
  { matches: ["soccer"], icon: CircleDot },
  { matches: ["tennis", "pickleball"], icon: CircleDot },
  { matches: ["baseball"], icon: Trophy },
  { matches: ["gymnastics"], icon: PersonStanding },
  { matches: ["bike"], icon: Bike },
  { matches: ["volleyball"], icon: Volleyball },
  { matches: ["frisbee"], icon: Disc3 },
  { matches: ["game room", "playground", "chess", "checkers"], icon: Gamepad2 },
  { matches: ["rugby"], icon: Trophy },
  { matches: ["fit walk"], icon: Footprints },
  { matches: ["hammock"], icon: Tent },
  { matches: ["yoga", "meditation"], icon: PersonStanding },
  { matches: ["riding"], icon: RidingIcon },
  { matches: ["candles"], icon: Flame },
  { matches: ["strings", "beads"], icon: Bean },
  { matches: ["clay", "sculpture"], icon: Shell },
  { matches: ["draw", "drawing"], icon: Brush },
  { matches: ["project runway"], icon: Scissors },
  { matches: ["lapidary"], icon: Gem },
  { matches: ["tie-dye"], icon: Sparkles },
  { matches: ["shrinky"], icon: Origami },
  { matches: ["drama", "play"], icon: Theater },
  { matches: ["bachata"], icon: Music },
  { matches: ["jam session"], icon: Drum },
  { matches: ["improv", "comedy"], icon: Laugh },
  { matches: ["walden pond"], icon: Image },
  { matches: ["video"], icon: Video },
  { matches: ["b&w photo", "digital photo", "photo"], icon: Camera },
  { matches: ["radio"], icon: Radio },
  { matches: ["beats", "music creation"], icon: Headphones },
  { matches: ["farm", "garden"], icon: Sprout },
  { matches: ["animal care", "kittens"], icon: PawPrint },
  { matches: ["nature class"], icon: Leaf },
  { matches: ["campcraft"], icon: TentTree },
  { matches: ["hikes", "trips"], icon: MapPinned }
];

const areaIcons: Record<string, IconComponent> = {
  waterfront: Waves,
  athletics: Trophy,
  fitness: Dumbbell,
  riding: RidingIcon,
  "arts & crafts": Palette,
  "performing arts": Drama,
  "media & tech": Camera,
  nature: TreePine
};

function normalize(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function resolveIcon(activity?: string | null, area?: string | null): IconComponent {
  const activityName = normalize(activity);
  const match = activityRules.find((rule) => rule.matches.some((term) => activityName.includes(term)));
  if (match) return match.icon;
  return areaIcons[normalize(area)] ?? BadgeCheck;
}

function themeFor(area?: string | null) {
  return areaThemes[normalize(area)] ?? defaultTheme;
}

export function ActivityIcon({
  activity,
  area,
  className,
  iconClassName,
  size = "md"
}: {
  activity?: string | null;
  area?: string | null;
  className?: string;
  iconClassName?: string;
  size?: "sm" | "md" | "lg";
}) {
  const Icon = resolveIcon(activity, area);
  const theme = themeFor(area);
  const sizes = {
    sm: { tile: "h-8 w-8 rounded-lg", icon: "h-4 w-4" },
    md: { tile: "h-10 w-10 rounded-xl", icon: "h-5 w-5" },
    lg: { tile: "h-12 w-12 rounded-2xl", icon: "h-6 w-6" }
  };

  return (
    <span
      aria-hidden="true"
      className={clsx("inline-flex shrink-0 items-center justify-center border shadow-sm", sizes[size].tile, theme.tile, className)}
      title={activity ?? area ?? "Camp activity"}
    >
      <Icon className={clsx(sizes[size].icon, theme.icon, iconClassName)} strokeWidth={2.35} />
    </span>
  );
}

export function areaSoftClass(area?: string | null) {
  return themeFor(area).soft;
}

function WaterSkiIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 19c3.8 1.7 9.2 1.7 14 0" />
      <path d="M3.5 16.5c4.4 1.7 12.6 1.7 17 0" />
      <path d="M9.2 14.4 13 7.6" />
      <path d="m14 7 2.8 2.4 2.2.2" />
      <path d="M12.8 7.4a1.8 1.8 0 1 0-2.8-2.2 1.8 1.8 0 0 0 2.8 2.2Z" />
      <path d="m8.7 15.4 4.7 1" />
      <path d="m13.2 16.4 4.8-1.1" />
    </svg>
  );
}

function KayakIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3.5 14.5c4-3 13-3 17 0-3.4 2.2-13.6 2.2-17 0Z" />
      <path d="M10 14.2a2 2 0 0 1 4 0" />
      <path d="m5 7 14 10" />
      <path d="M4 6.2 6.4 8" />
      <path d="m17.6 16 2.4 1.8" />
    </svg>
  );
}

function PaddleBoardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 18.5c3.4 1.2 8.6 1.2 12 0" />
      <path d="M8 15.5c2.2.7 5.8.7 8 0" />
      <path d="M12 4.5v10" />
      <path d="M12 4.5c1.1.7 2 1.9 2 3.2S13.1 10.1 12 11c-1.1-.9-2-2-2-3.3s.9-2.5 2-3.2Z" />
      <path d="m16.5 5.5-1.4 9.2" />
    </svg>
  );
}

function TubeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M4 18.5c4.5 1.5 11.5 1.5 16 0" />
      <path d="M18.5 8.2 21 6.5" />
    </svg>
  );
}

function RidingIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 15.5h8.8l2.2-3.2h3.5l1.5 2.2" />
      <path d="M7 15.5 5.5 20" />
      <path d="M15 15.5 16.5 20" />
      <path d="M12.2 15.5 11 20" />
      <path d="M18 12.3 20.5 10" />
      <path d="M8 13.5c.5-2.2 2-3.5 4.2-3.5h2" />
      <path d="M10 9.8 8.5 7.5" />
      <path d="M13.8 7.2a1.5 1.5 0 1 0-2.8-1 1.5 1.5 0 0 0 2.8 1Z" />
    </svg>
  );
}
