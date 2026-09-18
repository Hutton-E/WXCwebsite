import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Safari (even recent versions) can lack async iteration support on
// ReadableStream (`for await (const chunk of stream)`), which pdf.js relies
// on internally. Patch it in manually if missing, before any PDF parsing
// happens.
if (
  typeof ReadableStream !== "undefined" &&
  !(
    ReadableStream.prototype as unknown as {
      [Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
    }
  )[Symbol.asyncIterator]
) {
  (
    ReadableStream.prototype as unknown as {
      [Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
    }
  )[Symbol.asyncIterator] = function (this: ReadableStream<unknown>) {
    const reader = this.getReader();
    return {
      next: () => reader.read(),
      return: (value: unknown) => {
        reader.releaseLock();
        return Promise.resolve({ done: true, value });
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  };
}

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

// A single unified row per athlete per day — regardless of whether their
// sheet was the simple lettered-group format, the interval/pace-table
// format, or both at once.
export interface WorkoutRow {
  name: string;
  groupLetter: string | null;
  intervals: Record<string, string>;
  note: string | null;
  pageIndex: number;
  // Identifies the mini-table/section this athlete came from.
  sectionId: string;
  // Excel workout files explicitly identify the team by section.
  // Optional so existing PDF parsing continues to work unchanged.
  team?: "mens-cross-country" | "womens-cross-country";
}

export interface WorkoutGroupDefinition {
  groupLetter: string;
  description: string;
  pageIndex: number;
  // Identifies the mini-table/section this definition came from.
  sectionId: string;
  // Excel workout files explicitly identify the team by section.
  // Optional so existing PDF parsing continues to work unchanged.
  team?: "mens-cross-country" | "womens-cross-country";
}

export interface ParsedWorkouts {
  workoutRows: WorkoutRow[];
  groupDefinitions: WorkoutGroupDefinition[];
}

const ROW_TOLERANCE = 10;
const COLUMN_GAP_THRESHOLD = 25;
const PDF_LOAD_TIMEOUT_MS = 30000;

// Description/legend text consistently lives in a dedicated right-hand
// column (x > ~600pt) across every observed page layout. Used ONLY for
// identifying legend TEXT — not for deciding what counts as row data
// (see dataCutoffX, computed per header-segment instead).
const LEGEND_MIN_X = 580;

const NAME_TOKEN_RE = /^[A-Za-z'.-]+,?$/;
const DATE_TOKEN_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
const DECORATIVE_DOTS_RE = /^[.\u2026]+$/;
// A real interval column label always contains a digit (400, 1k, 800,
// 200, 600, 1200, ...) — this is how we tell "this segment has real
// interval columns" apart from "this segment only has a bare G column."
const INTERVAL_LABEL_RE = /\d/;

function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  label: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `${label} timed out after ${ms / 1000}s — try again or check your connection.`,
            ),
          ),
        ms,
      ),
    ),
  ]);
}

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

// ---------- Header column detection ----------

function clusterHeaderIntoColumns(
  headerWords: PositionedWord[],
): { key: string; x: number }[] {
  const relevant = headerWords
    .filter(
      (w) =>
        w.x <= LEGEND_MIN_X &&
        w.text !== "WO" &&
        !DATE_TOKEN_RE.test(w.text) &&
        !DECORATIVE_DOTS_RE.test(w.text),
    )
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

// A header row for one of a page's mini-tables — either the primary row
// (has "WO" + date) or a secondary one further down the page (no "WO",
// just column labels like "T (400) 1k T CV (400) 600 CV 400 VO2 200 R" —
// a DIFFERENT distance group sharing the same page). Detected by: doesn't
// start with a real name, and has several tokens that look like column
// labels rather than athlete data.
function looksLikeHeaderRow(row: PositionedWord[]): boolean {
  if (row.some((w) => w.text === "WO")) return true;

  const first = row[0]?.text ?? "";
  const second = row[1]?.text ?? "";
  const startsWithName =
    NAME_TOKEN_RE.test(first) &&
    NAME_TOKEN_RE.test(second) &&
    !/^\d/.test(first);
  if (startsWithName) return false;

  const labelLikeCount = row.filter(
    (w) =>
      /^(T|CV|VO2|I|R|G)$/i.test(w.text) ||
      /^\(\d+\)$/.test(w.text) ||
      /^\d+k$/i.test(w.text) ||
      /^\d{2,4}$/.test(w.text),
  ).length;

  return labelLikeCount >= 3;
}

// ---------- Mileage PDF parsing (unchanged) ----------

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
  const pdf = await withTimeout(
    pdfjsLib.getDocument({ data: arrayBuffer }).promise,
    PDF_LOAD_TIMEOUT_MS,
    "PDF loading",
  );

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

// ---------- Workouts PDF parsing — UNIFIED, segmented by header row ----------
//
// A page can contain MORE THAN ONE mini-table (e.g. different groups
// running different distances, each with its own column set). Every
// header row on the page is detected, and each one governs only the rows
// beneath it up until the next header row — instead of assuming one
// header applies to the whole page, which silently dropped/misaligned
// any group whose columns didn't match the first header found.

export async function parseWorkoutsPdf(file: File): Promise<ParsedWorkouts> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await withTimeout(
    pdfjsLib.getDocument({ data: arrayBuffer }).promise,
    PDF_LOAD_TIMEOUT_MS,
    "PDF loading",
  );

  const workoutRows: WorkoutRow[] = [];
  const groupDefinitions: WorkoutGroupDefinition[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const words = await extractPageWords(page);
    const rows = clusterIntoRows(words);

    // A single PDF page can contain several independent mini-tables.
    // Keep every table/section isolated because the same group letters can
    // legitimately appear more than once on a page.
    const headerRowIndices = rows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => looksLikeHeaderRow(row))
      .map(({ idx }) => idx);

    if (headerRowIndices.length === 0) continue;

    for (let h = 0; h < headerRowIndices.length; h++) {
      const headerIdx = headerRowIndices[h];
      const nextHeaderIdx = headerRowIndices[h + 1] ?? rows.length;
      const headerRow = rows[headerIdx];
      const segmentRows = rows.slice(headerIdx + 1, nextHeaderIdx);
      const sectionId = `${pageNum}-${h}`;

      const columnAnchors = clusterHeaderIntoColumns(headerRow);
      if (columnAnchors.length === 0) continue;

      // Per-section cutoff. The right-hand legend/description area must not
      // be mistaken for athlete data.
      const maxAnchorX = Math.max(...columnAnchors.map((c) => c.x));
      const dataCutoffX = maxAnchorX + 40;

      const hasIntervalColumns = columnAnchors.some(
        (c) => c.key !== "G" && INTERVAL_LABEL_RE.test(c.key),
      );

      // Descriptions in the source sheets/PDF are attached to the section,
      // often appearing on the same row as the first athlete assigned to a
      // group. Read them row-by-row instead of concatenating the entire
      // right-hand side of the page. This preserves duplicate letters such
      // as A/B when different sections have different workouts.
      const definitionRows = [headerRow, ...segmentRows];
      const definitionsInSection = new Map<string, string>();

      for (const row of definitionRows) {
        const rightWords = row
          .filter((w) => w.x > LEGEND_MIN_X)
          .sort((a, b) => a.x - b.x);

        if (rightWords.length === 0) continue;

        const rightText = rightWords
          .map((w) => w.text)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        const match = rightText.match(/^([A-Z]{1,2}|XT|M)\s*:\s*(.+)$/i);

        if (match && match[2].trim()) {
          const letter = match[1].toUpperCase();
          definitionsInSection.set(letter, match[2].trim());
        }
      }

      for (const [groupLetter, description] of definitionsInSection) {
        groupDefinitions.push({
          groupLetter,
          description,
          pageIndex: pageNum,
          sectionId,
        });
      }

      for (const row of segmentRows) {
        const nameWords = extractLeadingName(row, 2);
        const displayName = toDisplayName(nameWords);
        if (!displayName) continue;

        const dataWords = row.filter(
          (w) => !nameWords.includes(w) && w.x <= dataCutoffX,
        );
        const assigned = assignToNearestColumn(dataWords, columnAnchors);

        let groupLetter: string | null = null;

        if (assigned["G"] && /^[A-Za-z]{1,2}$/.test(assigned["G"].trim())) {
          groupLetter = assigned["G"].trim().toUpperCase();
        } else if (!columnAnchors.some((c) => c.key === "G")) {
          const trailingWord = [...row]
            .reverse()
            .find((w) => w.x <= dataCutoffX);

          if (
            trailingWord &&
            !nameWords.includes(trailingWord) &&
            /^[A-Za-z]{1,2}$/.test(trailingWord.text) &&
            !Object.values(assigned).some((v) => v.includes(trailingWord.text))
          ) {
            groupLetter = trailingWord.text.toUpperCase();
          }
        }

        const intervals: Record<string, string> = {};
        let note: string | null = null;

        if (hasIntervalColumns) {
          for (const [label, value] of Object.entries(assigned)) {
            if (label === "G") continue;
            if (value.trim().length > 0) {
              intervals[label] = value.trim();
            }
          }
        } else {
          const groupWord = row.find(
            (w) =>
              /^[A-Z]{1,2}$/.test(w.text) &&
              Math.abs(
                w.x - (columnAnchors.find((c) => c.key === "G")?.x ?? -1),
              ) < 10,
          );

          const noteWords = row
            .filter(
              (w) =>
                w !== groupWord && !nameWords.includes(w) && w.x <= dataCutoffX,
            )
            .filter((w) => !DECORATIVE_DOTS_RE.test(w.text))
            .sort((a, b) => a.x - b.x);

          note =
            noteWords.length > 0
              ? noteWords
                  .map((w) => w.text)
                  .join(" ")
                  .trim()
              : null;
        }

        if (!groupLetter && Object.keys(intervals).length === 0 && !note) {
          continue;
        }

        workoutRows.push({
          name: displayName,
          groupLetter,
          intervals,
          note,
          pageIndex: pageNum,
          sectionId,
        });
      }
    }
  }

  return { workoutRows, groupDefinitions };
}
