import { RegistrationWindow } from "@prisma/client";

export const REGISTRATION_WINDOW_LABEL: Record<RegistrationWindow, string> = {
  [RegistrationWindow.Q1]: "Q1",
  [RegistrationWindow.Q2]: "Q2",
  [RegistrationWindow.Q3]: "Q3"
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
