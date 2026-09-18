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
const GROUP_TITLE_RE = /Group\s+([A-Za-z]{1,2}\*?)/i;
const DECORATIVE_RE = /^[.\u2026]+$/;

// Workout times in this workbook are stored as text.
// Examples: 01:35.2, 03:10.4, 01:26.4
const TIME_RE = /^\d{1,2}:\d{2}(?:\.\d+)?$/;

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

function isTimeString(text: string): boolean {
  return TIME_RE.test(text.trim());
}

function isIntervalValue(cell: XLSX.CellObject, text: string): boolean {
  if (!text) return false;

  // FBC is a legitimate workout target stored as text.
  if (text.toUpperCase() === "FBC") {
    return true;
  }

  // The workbook stores workout times such as
  // "01:35.2" as strings, so explicitly recognize them.
  if (isTimeString(text)) {
    return true;
  }

  // Numeric and date cells are also valid interval values.
  if (cell.t === "n" || cell.t === "d") {
    return true;
  }

  return false;
}

// Convert "Last, First" into "First Last".
function toDisplayName(rawName: string): string | null {
  const [last, first] = rawName.split(",").map((s) => s.trim());

  if (!first || !last) {
    return null;
  }

  return `${first} ${last}`;
}

function findGroupColumn(
  sheet: XLSX.WorkSheet,
  headerRow: number,
  athleteRows: number[],
): number {
  const range = XLSX.utils.decode_range(String(sheet["!ref"] ?? "A1:A1"));

  // First look for a "G" header.
  for (let column = 1; column <= range.e.c + 1; column++) {
    const value = normalizeText(getCellText(sheet, headerRow, column));

    if (value.toUpperCase() === "G") {
      return column;
    }
  }

  // If there is no G header, determine the group column
  // by finding the column containing the most group letters.
  const counts = new Map<number, number>();

  for (const row of athleteRows) {
    for (let column = FIRST_WORKOUT_COLUMN; column <= range.e.c + 1; column++) {
      const value = getCellText(sheet, row, column);

      if (!isGroupLetter(value)) {
        continue;
      }

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

  if (!normalized) {
    return;
  }

  // A cell can contain more than one definition.
  const parts = normalized.split(/\s{3,}(?=[A-Za-z]{1,2}\*?\s*:)/);

  for (const part of parts) {
    const match = part.match(/^([A-Za-z]{1,2}\*?)\s*:\s*(.+)$/i);

    if (!match) {
      continue;
    }

    const groupLetter = match[1].toUpperCase();

    const description = match[2].replace(/\s+/g, " ").trim();

    if (description) {
      definitions.set(groupLetter, description);
    }
  }
}

function addGroupTitleDescription(
  sheet: XLSX.WorkSheet,
  headerRow: number,
  definitions: Map<string, string>,
): void {
  // The workbook structure is:
  //
  // Row before workout header - group title
  // Row before workout header - workout description
  // Workout header - "WO 9/8/2026"
  //
  // Example:
  //
  // Women's — Group A
  // 4 x 800 T (60s Rest), ...
  // WO 9/8/2026

  const titleRow = headerRow - 2;
  const descriptionRow = headerRow - 1;

  if (titleRow < 1 || descriptionRow < 1) {
    return;
  }

  const range = XLSX.utils.decode_range(String(sheet["!ref"] ?? "A1:A1"));

  let title = "";
  let description = "";

  for (let column = 1; column <= range.e.c + 1; column++) {
    const text = getCellText(sheet, titleRow, column);

    if (text) {
      title = text;
      break;
    }
  }

  for (let column = 1; column <= range.e.c + 1; column++) {
    const text = getCellText(sheet, descriptionRow, column);

    if (text) {
      description = text;
      break;
    }
  }

  if (!title || !description) {
    return;
  }

  const groupMatch = title.match(GROUP_TITLE_RE);

  if (!groupMatch) {
    return;
  }

  const groupLetter = groupMatch[1].toUpperCase();

  const team = /women'?s/i.test(title)
    ? "womens-cross-country"
    : /men'?s/i.test(title)
      ? "mens-cross-country"
      : null;

  if (!team) {
    return;
  }

  // Some sheets use:
  //
  // A: workout description
  //
  // while others simply have:
  //
  // workout description
  //
  // Handle both formats.
  const definitionMatch = description.match(/^([A-Za-z]{1,2}\*?)\s*:\s*(.+)$/i);

  if (definitionMatch) {
    definitions.set(
      definitionMatch[1].toUpperCase(),
      definitionMatch[2].replace(/\s+/g, " ").trim(),
    );
  } else {
    definitions.set(groupLetter, description.replace(/\s+/g, " ").trim());
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

  // The workbook sheet name is the month-day.
  // Example:
  //
  // Week of 2026-09-08
  //      ↓
  // Sheet "9-8"
  //
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

  // Find every "WO MM/DD/YYYY" row.
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

    // Find all athlete rows in this section.
    for (let row = headerRow + 1; row < nextHeaderRow; row++) {
      if (isAthleteName(getCellText(sheet, row, 1))) {
        athleteRows.push(row);
      }
    }

    if (athleteRows.length === 0) {
      continue;
    }

    const groupColumn = findGroupColumn(sheet, headerRow, athleteRows);

    const intervalColumns: {
      column: number;
      label: string;
    }[] = [];

    // Workout interval columns are between
    // FIRST_WORKOUT_COLUMN and the group column.
    for (let column = FIRST_WORKOUT_COLUMN; column < groupColumn; column++) {
      const label = getCellText(sheet, headerRow, column);

      if (!label || isDecorativeHeader(label)) {
        continue;
      }

      intervalColumns.push({
        column,
        label,
      });
    }

    const sectionId = `${sheetName}-${headerRow}`;

    const definitionsInSection = new Map<string, string>();

    // NEW:
    // Read the normal workbook format where the
    // group title and workout description appear
    // above the WO header.
    addGroupTitleDescription(sheet, headerRow, definitionsInSection);

    // Also keep support for the older format where
    // definitions are written to the right of the
    // group column.
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
        team: /women'?s/i.test(getCellText(sheet, headerRow - 2, 2))
          ? "womens-cross-country"
          : "mens-cross-country",
      });
    }

    // Parse each athlete.
    for (const row of athleteRows) {
      const rawName = getCellText(sheet, row, 1);

      const name = toDisplayName(rawName);

      if (!name) {
        continue;
      }

      const rawGroup = getCellText(sheet, row, groupColumn);

      const groupLetter = isGroupLetter(rawGroup)
        ? rawGroup.toUpperCase()
        : null;

      const intervals: Record<string, string> = {};

      const notes: string[] = [];

      // Parse interval columns.
      for (const interval of intervalColumns) {
        const cell = getCell(sheet, row, interval.column);

        if (!cell) {
          continue;
        }

        const text = getCellText(sheet, row, interval.column);

        if (!text) {
          continue;
        }

        // FIX:
        // String-based workout times such as
        // "01:35.2" are now correctly treated
        // as interval values.
        if (isIntervalValue(cell, text)) {
          intervals[interval.label] = text;
        } else {
          notes.push(text);
        }
      }

      // Some workbooks store notes in otherwise
      // decorative columns immediately before G.
      for (let column = FIRST_WORKOUT_COLUMN; column < groupColumn; column++) {
        const headerText = getCellText(sheet, headerRow, column);

        if (headerText && !isDecorativeHeader(headerText)) {
          continue;
        }

        const text = getCellText(sheet, row, column);

        if (!text || isGroupLetter(text)) {
          continue;
        }

        if (!notes.includes(text)) {
          notes.push(text);
        }
      }

      const sectionTitle = getCellText(sheet, headerRow - 2, 2);

      const team = /women'?s/i.test(sectionTitle)
        ? "womens-cross-country"
        : /men'?s/i.test(sectionTitle)
          ? "mens-cross-country"
          : undefined;

      workoutRows.push({
        name,
        groupLetter,
        intervals,
        note: notes.length > 0 ? notes.join(" | ") : null,
        pageIndex: sectionIndex + 1,
        sectionId,
        team,
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
