import * as XLSX from "xlsx";
import type {
  WorkoutGroupDefinition,
  WorkoutRow,
  ParsedWorkouts,
} from "./pdfParser";

const FIRST_WORKOUT_COLUMN = 13;
const DEFAULT_GROUP_COLUMN = 23;

const NAME_RE = /^[^,]+,\s*.+$/;
const GROUP_RE = /^[A-Za-z]{1,2}\*?$/;
const DECORATIVE_RE = /^[.\u2026]+$/;

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function getCell(
  sheet: XLSX.WorkSheet,
  row: number,
  column: number,
): XLSX.CellObject | undefined {
  const address = XLSX.utils.encode_cell({
    r: row - 1,
    c: column - 1,
  });
  return sheet[address] as XLSX.CellObject | undefined;
}

function getCellText(
  sheet: XLSX.WorkSheet,
  row: number,
  column: number,
): string {
  const cell = getCell(sheet, row, column);
  if (!cell) return "";

  if (typeof cell.w === "string" && cell.w.trim()) {
    return cell.w.trim();
  }

  return normalizeText(cell.v);
}

function isAthleteName(value: unknown): boolean {
  return typeof value === "string" && NAME_RE.test(value.trim());
}

function isGroupLetter(value: unknown): boolean {
  return typeof value === "string" && GROUP_RE.test(value.trim());
}

function isDecorativeHeader(value: string): boolean {
  return DECORATIVE_RE.test(value.trim());
}

function isIntervalValue(cell: XLSX.CellObject, text: string): boolean {
  if (!text) return false;

  // FBC is a legitimate workout target stored as text rather than a time.
  if (text.toUpperCase() === "FBC") return true;

  // Times and numeric values are the normal interval-cell values.
  if (cell.t === "n" || cell.t === "d") return true;

  return false;
}

// Convert "Last, First" (the workbook's format) into "First Last" (the
// format athlete.name uses in Supabase) — without this, name matching
// silently fails for every row, since normalizeName() only lowercases
// and trims whitespace, it never reorders name parts.
function toDisplayName(rawName: string): string | null {
  const [last, first] = rawName.split(",").map((s) => s.trim());
  if (!first || !last) return null;
  return `${first} ${last}`;
}

function findGroupColumn(
  sheet: XLSX.WorkSheet,
  headerRow: number,
  athleteRows: number[],
): number {
  const range = XLSX.utils.decode_range(String(sheet["!ref"] ?? "A1:A1"));

  for (let column = 1; column <= range.e.c + 1; column++) {
    const value = normalizeText(getCellText(sheet, headerRow, column));
    if (value.toUpperCase() === "G") {
      return column;
    }
  }

  const counts = new Map<number, number>();

  for (const row of athleteRows) {
    for (let column = FIRST_WORKOUT_COLUMN; column <= range.e.c + 1; column++) {
      const value = getCellText(sheet, row, column);
      if (!isGroupLetter(value)) continue;

      counts.set(column, (counts.get(column) ?? 0) + 1);
    }
  }

  let bestColumn = DEFAULT_GROUP_COLUMN;
  let bestCount = 0;

  for (const [column, count] of counts) {
    if (count > bestCount) {
      bestColumn = column;
      bestCount = count;
    }
  }

  return bestColumn;
}

function addDescriptionsFromText(
  text: string,
  definitions: Map<string, string>,
): void {
  const normalized = text.trim();
  if (!normalized) return;

  // A cell can contain more than one definition, such as:
  // B: ... B*: ...
  // The source workbook separates these with a large amount of whitespace.
  const parts = normalized.split(/\s{3,}(?=[A-Za-z]{1,2}\*?\s*:)/);

  for (const part of parts) {
    const match = part.match(/^([A-Za-z]{1,2}\*?)\s*:\s*(.+)$/i);

    if (!match) continue;

    const groupLetter = match[1].toUpperCase();
    const description = match[2].replace(/\s+/g, " ").trim();

    if (description) {
      definitions.set(groupLetter, description);
    }
  }
}

function getTargetSheetName(weekOf: string): string {
  const parts = weekOf.split("-").map(Number);

  if (
    parts.length !== 3 ||
    parts.some((part) => !Number.isInteger(part)) ||
    parts[0] < 2000
  ) {
    throw new Error(
      "Please enter a valid Week of date before uploading the workout workbook.",
    );
  }

  const [, month, dayOfMonth] = parts;

  // "Week of" is the actual date of this specific workout day — matching
  // the same convention already used everywhere else in the app (the
  // PDF-based mileage/workouts flow). No offset needed: the sheet name is
  // simply that date's month-day.
  return `${month}-${dayOfMonth}`;
}

export async function parseWorkoutsExcel(
  file: File,
  weekOf: string,
  day: "tuesday" | "friday",
): Promise<ParsedWorkouts> {
  const arrayBuffer = await file.arrayBuffer();

  const workbook = XLSX.read(arrayBuffer, {
    type: "array",
    cellDates: true,
  });

  const targetSheetName = getTargetSheetName(weekOf);
  const sheetName = workbook.SheetNames.find(
    (name) => name.trim() === targetSheetName,
  );

  if (!sheetName) {
    throw new Error(
      `No workout sheet for ${targetSheetName} was found in this workbook. ` +
        `The selected Week of ${weekOf} and ${day} should correspond to sheet "${targetSheetName}".`,
    );
  }

  const sheet = workbook.Sheets[sheetName];

  if (!sheet || !sheet["!ref"]) {
    throw new Error(
      `The "${sheetName}" workout sheet is empty or could not be read.`,
    );
  }

  const range = XLSX.utils.decode_range(String(sheet["!ref"]));

  const headerRows: number[] = [];

  for (let row = 1; row <= range.e.r + 1; row++) {
    const firstCell = getCellText(sheet, row, 1);

    if (/^WO\s+\d{1,2}\/\d{1,2}\/\d{4}$/i.test(firstCell)) {
      headerRows.push(row);
    }
  }

  if (headerRows.length === 0) {
    throw new Error(
      `The "${sheetName}" sheet does not contain any recognizable workout sections.`,
    );
  }

  const workoutRows: WorkoutRow[] = [];
  const groupDefinitions: WorkoutGroupDefinition[] = [];

  for (let sectionIndex = 0; sectionIndex < headerRows.length; sectionIndex++) {
    const headerRow = headerRows[sectionIndex];
    const nextHeaderRow = headerRows[sectionIndex + 1] ?? range.e.r + 2;

    const athleteRows: number[] = [];

    for (let row = headerRow + 1; row < nextHeaderRow; row++) {
      if (isAthleteName(getCellText(sheet, row, 1))) {
        athleteRows.push(row);
      }
    }

    if (athleteRows.length === 0) continue;

    const groupColumn = findGroupColumn(sheet, headerRow, athleteRows);

    const intervalColumns: { column: number; label: string }[] = [];

    for (let column = FIRST_WORKOUT_COLUMN; column < groupColumn; column++) {
      const label = getCellText(sheet, headerRow, column);

      if (!label || isDecorativeHeader(label)) continue;

      intervalColumns.push({
        column,
        label,
      });
    }

    const sectionId = `${sheetName}-${headerRow}`;

    const definitionsInSection = new Map<string, string>();

    // Descriptions are usually in merged cells to the right of the group
    // column, often on the first athlete row assigned to that group.
    for (const row of [headerRow, ...athleteRows]) {
      for (let column = groupColumn + 1; column <= range.e.c + 1; column++) {
        const text = getCellText(sheet, row, column);
        if (text.includes(":")) {
          addDescriptionsFromText(text, definitionsInSection);
        }
      }
    }

    for (const [groupLetter, description] of definitionsInSection) {
      groupDefinitions.push({
        groupLetter,
        description,
        pageIndex: sectionIndex + 1,
        sectionId,
      });
    }

    for (const row of athleteRows) {
      const rawName = getCellText(sheet, row, 1);
      const name = toDisplayName(rawName);
      if (!name) continue;
      const rawGroup = getCellText(sheet, row, groupColumn);

      const groupLetter = isGroupLetter(rawGroup)
        ? rawGroup.toUpperCase()
        : null;

      const intervals: Record<string, string> = {};
      const notes: string[] = [];

      for (const interval of intervalColumns) {
        const cell = getCell(sheet, row, interval.column);
        if (!cell) continue;

        const text = getCellText(sheet, row, interval.column);
        if (!text) continue;

        if (isIntervalValue(cell, text)) {
          intervals[interval.label] = text;
        } else {
          notes.push(text);
        }
      }

      // The source workbook sometimes stores notes in otherwise decorative
      // columns immediately before the group column.
      for (let column = FIRST_WORKOUT_COLUMN; column < groupColumn; column++) {
        const headerText = getCellText(sheet, headerRow, column);

        if (headerText && !isDecorativeHeader(headerText)) {
          continue;
        }

        const text = getCellText(sheet, row, column);
        if (!text || isGroupLetter(text)) continue;

        if (!notes.includes(text)) {
          notes.push(text);
        }
      }

      workoutRows.push({
        name,
        groupLetter,
        intervals,
        note: notes.length > 0 ? notes.join(" | ") : null,
        pageIndex: sectionIndex + 1,
        sectionId,
      });
    }
  }

  if (workoutRows.length === 0) {
    throw new Error(
      `The "${sheetName}" sheet was found, but no athlete workout rows could be parsed.`,
    );
  }

  return {
    workoutRows,
    groupDefinitions,
  };
}
