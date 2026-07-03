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

export function parseRegistrationWindow(value?: string | string[] | null): RegistrationWindow {
  const first = Array.isArray(value) ? value[0] : value;
  return Object.values(RegistrationWindow).includes(first as RegistrationWindow) ? (first as RegistrationWindow) : RegistrationWindow.Q1;
}
