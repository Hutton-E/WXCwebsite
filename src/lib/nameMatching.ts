export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

export function buildNameLookup(
  athletes: { id: string; name: string }[],
): Map<string, { id: string; name: string }> {
  const map = new Map<string, { id: string; name: string }>();
  for (const a of athletes) {
    map.set(normalizeName(a.name), a);
  }
  return map;
}

export function matchName(
  parsedName: string,
  lookup: Map<string, { id: string; name: string }>,
): string | null {
  const match = lookup.get(normalizeName(parsedName));
  return match ? match.id : null;
}
