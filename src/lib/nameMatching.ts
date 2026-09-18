export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

export function buildAliasLookup(
  aliases: { alias_name: string; athlete_id: string }[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const a of aliases) {
    map.set(normalizeName(a.alias_name), a.athlete_id);
  }
  return map;
}

export function matchName(
  parsedName: string,
  nameLookup: Map<string, { id: string; name: string }>,
  aliasLookup?: Map<string, string>,
): string | null {
  const normalized = normalizeName(parsedName);

  // Check learned aliases first — this is what makes matching self-healing.
  if (aliasLookup?.has(normalized)) {
    return aliasLookup.get(normalized)!;
  }

  const match = nameLookup.get(normalized);
  return match ? match.id : null;
}
