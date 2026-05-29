export function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
  }
}

export function writeStringArray(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(String));
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return JSON.stringify([]);
    try {
      const parsed = JSON.parse(trimmed);
      return JSON.stringify(Array.isArray(parsed) ? parsed.map(String) : [String(parsed)]);
    } catch {
      return JSON.stringify(trimmed.split(",").map((item) => item.trim()).filter(Boolean));
    }
  }
  return JSON.stringify([]);
}
