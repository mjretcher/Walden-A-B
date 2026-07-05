import { RegistrationWindow } from "@prisma/client";

// Labels intentionally avoid "Q1"/"Q2"/"Q3" — that vocabulary is already used
// for the top-level Session (e.g. "Q1 2026" vs "Q2 2026"), which is a
// completely different concept from these within-session registration
// windows. Reusing the same labels for both was a real source of confusion:
// the session color chip in the header and this picker could both say "Q1"
// while meaning entirely different things. The underlying enum values
// (Q1/Q2/Q3) are unchanged — only what's shown to users changes.
export const REGISTRATION_WINDOW_LABEL: Record<RegistrationWindow, string> = {
  [RegistrationWindow.Q1]: "Weeks 1-2",
  [RegistrationWindow.Q2]: "Weeks 3-4",
  [RegistrationWindow.Q3]: "Session 2"
};

export const REGISTRATION_WINDOW_DESCRIPTION: Record<RegistrationWindow, string> = {
  [RegistrationWindow.Q1]: "First session, first two weeks",
  [RegistrationWindow.Q2]: "First session, second two weeks",
  [RegistrationWindow.Q3]: "Second session"
};

export function parseRegistrationWindow(value?: string | string[] | null, fallback: RegistrationWindow = RegistrationWindow.Q1): RegistrationWindow {
  const first = Array.isArray(value) ? value[0] : value;
  return Object.values(RegistrationWindow).includes(first as RegistrationWindow) ? (first as RegistrationWindow) : fallback;
}

// Q1/Q2/Q3 name the top-level Session too (e.g. "Q1 2026" vs "Q2 2026" - see
// the comment above), and that's the thing that actually gets switched when
// camp moves from weeks 1-2 to weeks 3-4. So the active session's name/cycle
// already says which window is "current" - this just reads that instead of
// making people re-pick it by hand on every report. Falls back to Q1 (the
// old hardcoded behavior) if the session isn't named with a recognizable
// Q1/Q2/Q3 token, so a session named some other way is no worse off than
// before.
export function inferCurrentRegistrationWindow(session?: { name?: string | null; cycle?: string | null } | null): RegistrationWindow {
  const source = `${session?.cycle ?? ""} ${session?.name ?? ""}`;
  if (/\bq3\b/i.test(source)) return RegistrationWindow.Q3;
  if (/\bq2\b/i.test(source)) return RegistrationWindow.Q2;
  return RegistrationWindow.Q1;
}
