import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface PositionedWord {
  text: string;
  x: number;
  top: number;
}

export interface MileageRow {
  name: string;
  team: "mens-cross-country" | "womens-cross-country";
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
  weeklyTotal: string;
  notes: string;
}

export interface WorkoutAssignment {
  name: string;
  groupLetter: string;
  note: string | null;
}

export interface WorkoutGroupDefinition {
  groupLetter: string;
  description: string;
}

export interface WorkoutIntervalRow {
  name: string;
  intervals: Record<string, string>;
}

export interface ParsedWorkouts {
  assignments: WorkoutAssignment[];
  groupDefinitions: WorkoutGroupDefinition[];
  intervalRows: WorkoutIntervalRow[];
}

const ROW_TOLERANCE = 10;
const COLUMN_GAP_THRESHOLD = 25;

const NAME_TOKEN_RE = /^[A-Za-z'.-]+,?$/;
const DATE_TOKEN_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;

// Decorative dot/ellipsis "columns" — made up entirely of periods or the
// ellipsis character. These are visual filler, never a real coach note.
const DECORATIVE_DOTS_RE = /^[.\u2026]+$/;

// ---------- Core: extract positioned words from a PDF page ----------

function splitIntoWordTokens(
  str: string,
  x: number,
  top: number,
  width: number,
): PositionedWord[] {
  const parts = str.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return [{ text: str, x, top }];
  }

  const totalChars = parts.reduce((sum, p) => sum + p.length, 0) || 1;
  let cursor = x;
  const results: PositionedWord[] = [];

  for (const part of parts) {
    results.push({ text: part, x: cursor, top });
    const partWidth = (width * part.length) / totalChars;
    cursor += partWidth + width * 0.02;
  }

  return results;
}

async function extractPageWords(
  page: pdfjsLib.PDFPageProxy,
): Promise<PositionedWord[]> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();

  const words: PositionedWord[] = [];

  for (const item of content.items) {
    if (!("str" in item) || item.str.trim().length === 0) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    const top = viewport.height - y;
    const width = "width" in item ? (item.width as number) : 0;

    words.push(...splitIntoWordTokens(item.str.trim(), x, top, width));
  }

  return words;
}

// ---------- Row clustering ----------

function clusterIntoRows(words: PositionedWord[]): PositionedWord[][] {
  const sorted = [...words].sort((a, b) => a.top - b.top);
  const rows: PositionedWord[][] = [];

  for (const word of sorted) {
    const lastRow = rows[rows.length - 1];
    if (lastRow && Math.abs(lastRow[0].top - word.top) <= ROW_TOLERANCE) {
      lastRow.push(word);
    } else {
      rows.push([word]);
    }
  }

  rows.forEach((row) => row.sort((a, b) => a.x - b.x));
  return rows;
}

// ---------- Name extraction ----------

function extractLeadingName(
  sortedRowWords: PositionedWord[],
  maxTokens = 2,
): PositionedWord[] {
  const result: PositionedWord[] = [];
  for (const w of sortedRowWords) {
    if (result.length >= maxTokens) break;
    if (!NAME_TOKEN_RE.test(w.text)) break;
    result.push(w);
  }
  return result;
}

function toDisplayName(nameWords: PositionedWord[]): string | null {
  if (nameWords.length < 2) return null;
  const raw = nameWords
    .map((w) => w.text)
    .join(" ")
    .replace(/,$/, "");
  const [last, first] = raw.split(",").map((s) => s.trim());
  if (!first) return null;
  return `${first} ${last}`;
}

// ---------- Nearest-anchor column assignment ----------

function assignToNearestColumn(
  rowWords: PositionedWord[],
  columnAnchors: { key: string; x: number }[],
): Record<string, string> {
  const buckets: Record<string, PositionedWord[]> = {};
  columnAnchors.forEach((c) => (buckets[c.key] = []));

  for (const word of rowWords) {
    let closest = columnAnchors[0];
    let minDist = Math.abs(word.x - closest.x);
    for (const anchor of columnAnchors) {
      const dist = Math.abs(word.x - anchor.x);
      if (dist < minDist) {
        minDist = dist;
        closest = anchor;
      }
    }
    buckets[closest.key].push(word);
  }

  const result: Record<string, string> = {};
  for (const key of Object.keys(buckets)) {
    result[key] = buckets[key]
      .sort((a, b) => a.x - b.x)
      .map((w) => w.text)
      .join(" ");
  }
  return result;
}

// ---------- Interval header column detection ----------

function clusterHeaderIntoColumns(
  headerWords: PositionedWord[],
): { key: string; x: number }[] {
  const relevant = headerWords
    .filter((w) => w.text !== "WO" && !DATE_TOKEN_RE.test(w.text))
    .sort((a, b) => a.x - b.x);

  if (relevant.length === 0) return [];

  const groups: PositionedWord[][] = [[relevant[0]]];
  for (let i = 1; i < relevant.length; i++) {
    const prev = relevant[i - 1];
    const curr = relevant[i];
    if (curr.x - prev.x <= COLUMN_GAP_THRESHOLD) {
      groups[groups.length - 1].push(curr);
    } else {
      groups.push([curr]);
    }
  }

  return groups.map((group) => ({
    key: group.map((w) => w.text).join(" "),
    x: group.reduce((sum, w) => sum + w.x, 0) / group.length,
  }));
}

// ---------- Mileage PDF parsing ----------

const MILEAGE_DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function findHeaderAnchors(
  rows: PositionedWord[][],
): { key: string; x: number }[] | null {
  for (const row of rows) {
    const rowText = row.map((w) => w.text);
    const hasAllDays = MILEAGE_DAY_HEADERS.every((d) => rowText.includes(d));
    if (!hasAllDays) continue;

    const anchors: { key: string; x: number }[] = [];
    const dayKeys = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ];

    MILEAGE_DAY_HEADERS.forEach((label, i) => {
      const word = row.find((w) => w.text === label);
      if (word) anchors.push({ key: dayKeys[i], x: word.x });
    });

    const mileageWord = row.find((w) => w.text === "Mileage");
    if (mileageWord) anchors.push({ key: "weeklyTotal", x: mileageWord.x });

    const notesWord = row.find((w) => w.text === "Notes");
    if (notesWord) anchors.push({ key: "notes", x: notesWord.x });

    if (anchors.length >= 8) return anchors;
  }
  return null;
}

export async function parseMileagePdf(file: File): Promise<MileageRow[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const results: MileageRow[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const words = await extractPageWords(page);
    const rows = clusterIntoRows(words);

    const allPageText = words.map((w) => w.text).join(" ");
    const team: MileageRow["team"] = /women/i.test(allPageText)
      ? "womens-cross-country"
      : "mens-cross-country";

    const anchors = findHeaderAnchors(rows);
    if (!anchors) continue;

    for (const row of rows) {
      if (row.some((w) => w.text === "Mon")) continue;

      const nameWords = extractLeadingName(row, 2);
      const displayName = toDisplayName(nameWords);
      if (!displayName) continue;

      const dataWords = row.filter((w) => !nameWords.includes(w));
      const assigned = assignToNearestColumn(dataWords, anchors);

      results.push({
        name: displayName,
        team,
        monday: assigned.monday || "",
        tuesday: assigned.tuesday || "",
        wednesday: assigned.wednesday || "",
        thursday: assigned.thursday || "",
        friday: assigned.friday || "",
        saturday: assigned.saturday || "",
        sunday: assigned.sunday || "",
        weeklyTotal: assigned.weeklyTotal || "",
        notes: assigned.notes || "",
      });
    }
  }

  return results;
}

// ---------- Workouts PDF parsing ----------

export async function parseWorkoutsPdf(file: File): Promise<ParsedWorkouts> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const assignments: WorkoutAssignment[] = [];
  const definitionsByLetter = new Map<string, string>();
  const intervalRows: WorkoutIntervalRow[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const words = await extractPageWords(page);
    const rows = clusterIntoRows(words);

    const groupHeaderWord = words.find((w) => w.text === "G" && w.top < 30);

    if (groupHeaderWord) {
      // ---- Lettered-group format ----
      const groupColumnX = groupHeaderWord.x;
      const descriptionMinX = groupColumnX + 15;

      for (const row of rows) {
        const nameWords = extractLeadingName(row, 2);
        const displayName = toDisplayName(nameWords);
        if (!displayName) continue;

        const groupWord = row.find(
          (w) =>
            Math.abs(w.x - groupColumnX) < 10 && /^[A-Z]{1,2}$/.test(w.text),
        );
        if (!groupWord) continue;

        // Anything left between the name and the group letter that ISN'T a
        // decorative dot/ellipsis filler is a real coach note — e.g. "20 max"
        // or "20 max or XT" attached to a specific athlete's row.
        const noteWords = row
          .filter((w) => w !== groupWord && !nameWords.includes(w))
          .filter((w) => w.x < groupColumnX - 5)
          .filter((w) => !DECORATIVE_DOTS_RE.test(w.text))
          .sort((a, b) => a.x - b.x);

        const note =
          noteWords.length > 0
            ? noteWords
                .map((w) => w.text)
                .join(" ")
                .trim()
            : null;

        assignments.push({
          name: displayName,
          groupLetter: groupWord.text,
          note,
        });
      }

      const descWords = words
        .filter((w) => w.x > descriptionMinX)
        .sort((a, b) => a.top - b.top || a.x - b.x);

      const fullText = descWords.map((w) => w.text).join(" ");
      const segments = fullText.split(/(?=\b(?:[A-Z]{1,2}|XT|M):)/);

      for (const segment of segments) {
        const trimmed = segment.trim();
        const match = trimmed.match(/^([A-Z]{1,2}|XT|M):\s*(.+)$/);
        if (match) {
          definitionsByLetter.set(match[1], match[2].trim());
        }
      }
    } else {
      // ---- Interval/pace-table format ----
      const headerRow = rows.find((row) => row.some((w) => w.text === "WO"));
      if (!headerRow) continue;

      const columnAnchors = clusterHeaderIntoColumns(headerRow);
      if (columnAnchors.length === 0) continue;

      for (const row of rows) {
        if (row === headerRow) continue;

        const nameWords = extractLeadingName(row, 2);
        const displayName = toDisplayName(nameWords);
        if (!displayName) continue;

        const dataWords = row.filter((w) => !nameWords.includes(w));
        const assigned = assignToNearestColumn(dataWords, columnAnchors);

        const intervals: Record<string, string> = {};
        for (const [label, value] of Object.entries(assigned)) {
          if (value.trim().length > 0) intervals[label] = value.trim();
        }

        if (Object.keys(intervals).length > 0) {
          intervalRows.push({ name: displayName, intervals });
        }
      }
    }
  }

  const groupDefinitions: WorkoutGroupDefinition[] = Array.from(
    definitionsByLetter.entries(),
  ).map(([groupLetter, description]) => ({ groupLetter, description }));

  return { assignments, groupDefinitions, intervalRows };
}
