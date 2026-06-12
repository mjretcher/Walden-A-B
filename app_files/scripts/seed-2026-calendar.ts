import { PrismaClient, SessionDayType } from "@prisma/client";

const prisma = new PrismaClient();

const firstSessionDays: Array<{ date: string; dayType: SessionDayType; notes?: string }> = [
  { date: "2026-06-22", dayType: SessionDayType.ARRIVAL, notes: "Arrival Day; Swim Check; Rot. Area; Pre Campfire; All Staff on for EP; No Off Grounds" },
  { date: "2026-06-23", dayType: SessionDayType.REGISTRATION, notes: "Registration; Teach Fire/Storm; 4 Way Soccer; Welcome Back Show; All Staff on for EP" },
  { date: "2026-06-24", dayType: SessionDayType.A, notes: "A/B Classes Start; POL; Cabin Photos" },
  { date: "2026-06-25", dayType: SessionDayType.B, notes: "Hoeft; Evals of camper adjustment; Measure for jackets and sweatshirts" },
  { date: "2026-06-26", dayType: SessionDayType.A, notes: "Hoeft; Trip tick check; lunch off for staff working Saturday" },
  { date: "2026-06-27", dayType: SessionDayType.S, notes: "New Boys Side Program; Big Sis/Little Sis B-Side; Day Off" },
  { date: "2026-06-28", dayType: SessionDayType.B, notes: "Walden II; Walden Idol Prep" },
  { date: "2026-06-29", dayType: SessionDayType.A, notes: "Walden II; Trip tick check" },
  { date: "2026-06-30", dayType: SessionDayType.S, notes: "Homecoming; Day Off" },
  { date: "2026-07-01", dayType: SessionDayType.B, notes: "Hoeft; Horseshoe visits; All camp tick check" },
  { date: "2026-07-02", dayType: SessionDayType.A, notes: "Hoeft; Trip tick check; Pop on Porch / Dairy Queen; Walden Idol Performances" },
  { date: "2026-07-03", dayType: SessionDayType.S, notes: "Capture the Camp" },
  { date: "2026-07-04", dayType: SessionDayType.B, notes: "July 4 B-Day morning; extended rest hour; no twilight; carnival" },
  { date: "2026-07-05", dayType: SessionDayType.A, notes: "Two-weekers leave; five-weekers/3-4 weekers arrive" },
  { date: "2026-07-06", dayType: SessionDayType.B, notes: "Walden II; staff eval on kids group #1" },
  { date: "2026-07-07", dayType: SessionDayType.S, notes: "All-Camp Mack; Day Off" },
  { date: "2026-07-08", dayType: SessionDayType.S, notes: "Sleeping Bear; staff eval on kids group #2" },
  { date: "2026-07-09", dayType: SessionDayType.B, notes: "Sleeping Bear; Tanuga visits; Cabin Photos; Counselor Hunt; No Twilight" },
  { date: "2026-07-10", dayType: SessionDayType.A, notes: "Sleeping Bear; Pizza Hut & McDonalds Trips" },
  { date: "2026-07-11", dayType: SessionDayType.S, notes: "Unit-based special day; Registration Tuesday; Day Off" },
  { date: "2026-07-12", dayType: SessionDayType.B, notes: "Walden Under; No Twilight; All Staff On" },
  { date: "2026-07-13", dayType: SessionDayType.A, notes: "Lunch off for staff working Tuesday" },
  { date: "2026-07-14", dayType: SessionDayType.S, notes: "Color Clash; Day Off" },
  { date: "2026-07-15", dayType: SessionDayType.B, notes: "Walden II; P&C-WSL; Unit 4 Silent Disco" },
  { date: "2026-07-16", dayType: SessionDayType.A, notes: "Walden II return; No Twilight; Play/WBA" },
  { date: "2026-07-17", dayType: SessionDayType.B, notes: "Packing; AM classes; awards show; campfire; no off grounds" },
  { date: "2026-07-18", dayType: SessionDayType.DEPARTURE, notes: "Good-Bye; Visiting Day" }
];

async function main() {
  const session = await prisma.session.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } });
  if (!session) throw new Error("No active session found.");

  for (const day of firstSessionDays) {
    await prisma.sessionCalendarDay.upsert({
      where: { sessionId_date: { sessionId: session.id, date: new Date(`${day.date}T12:00:00Z`) } },
      create: {
        sessionId: session.id,
        date: new Date(`${day.date}T12:00:00Z`),
        dayType: day.dayType,
        notes: day.notes
      },
      update: {
        dayType: day.dayType,
        notes: day.notes
      }
    });
  }

  console.log(`Seeded ${firstSessionDays.length} calendar days into ${session.name}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
