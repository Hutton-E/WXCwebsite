import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface PositionedWord {
  text: string;
  x: number;
  top: number; // distance from top of page — smaller = higher up
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
}

export interface WorkoutGroupDefinition {
  groupLetter: string;
  description: string;
}

export interface WorkoutIntervalRow {
  name: string;
  intervals: Record<string, string>; // e.g. { "T (400)": "01:43.1", "800 CV": "03:26.3" }
}

export interface ParsedWorkouts {
  assignments: WorkoutAssignment[];
  groupDefinitions: WorkoutGroupDefinition[];
  intervalRows: WorkoutIntervalRow[];
}

const ROW_TOLERANCE = 10; // px — words within this vertical distance are "the same row"
const COLUMN_GAP_THRESHOLD = 25; // px gap that separates two header column labels

// Matches only alphabetic name-like tokens (letters, apostrophes, hyphens,
// an optional trailing comma). Anything else — digits, times like "01:18.5",
// decorative dots/ellipses — fails this and stops name extraction immediately.
const NAME_TOKEN_RE = /^[A-Za-z'.-]+,?$/;
const DATE_TOKEN_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;

// ---------- Core: extract positioned words from a PDF page ----------

// pdfjs-dist reports text in whatever runs the PDF itself was drawn with —
// NOT one word per item. A cell like "Maas, Lydia" can arrive as ONE item
// containing a space. Split every item's string on whitespace into
// individual word-tokens, estimating each token's x-position proportionally
// across the item's width, so all downstream logic can work on a
// one-word-per-token basis (matching how the parsing rules below are
// designed and were validated).
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
    cursor += partWidth + width * 0.02; // small gap approximation between words
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
    // pdfjs y is measured from the BOTTOM of the page — flip so smaller = higher,
    // matching the "top" convention used throughout this parser.
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

  // Sort words left-to-right within each row
  rows.forEach((row) => row.sort((a, b) => a.x - b.x));
  return rows;
}

// ---------- Name extraction: take up to N leading name-like tokens, no more ----------

function extractLeadingName(
  sortedRowWords: PositionedWord[],
  maxTokens = 2,
): PositionedWord[] {
  const result: PositionedWord[] = [];
  for (const w of sortedRowWords) {
    if (result.length >= maxTokens) break;
    if (!NAME_TOKEN_RE.test(w.text)) break; // stop at the FIRST non-name-like token
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

// ---------- Interval-format header detection: cluster header words into columns by x-gap ----------

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
    if (!anchors) continue; // page has no roster table (e.g. a legend/notes-only page)

    for (const row of rows) {
      // Skip the header row itself
      if (row.some((w) => w.text === "Mon")) continue;

      const nameWords = extractLeadingName(row, 2);
      const displayName = toDisplayName(nameWords);
      if (!displayName) continue; // not a real name row (e.g. a lone marker)

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

        assignments.push({ name: displayName, groupLetter: groupWord.text });
      }

      // Reconstruct group definitions from the description text block,
      // read in top-to-bottom, left-to-right order, then split on "X:" labels.
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
      // ---- Interval/pace-table format (no group letter on this page) ----
      const headerRow = rows.find((row) => row.some((w) => w.text === "WO"));
      if (!headerRow) continue; // not a recognizable table page (e.g. blank/legend)

      const columnAnchors = clusterHeaderIntoColumns(headerRow);
      if (columnAnchors.length === 0) continue;

      for (const row of rows) {
        if (row === headerRow) continue;

        const nameWords = extractLeadingName(row, 2);
        const displayName = toDisplayName(nameWords);
        if (!displayName) continue;

        const dataWords = row.filter((w) => !nameWords.includes(w));
        const assigned = assignToNearestColumn(dataWords, columnAnchors);

        // Only keep columns that actually have a value for this athlete —
        // not everyone runs every interval.
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
