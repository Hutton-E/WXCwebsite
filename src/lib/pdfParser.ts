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

export interface ParsedWorkouts {
  assignments: WorkoutAssignment[];
  groupDefinitions: WorkoutGroupDefinition[];
}

const ROW_TOLERANCE = 10; // px — words within this vertical distance are "the same row"

// ---------- Core: extract positioned words from a PDF page ----------

async function extractPageWords(
  page: pdfjsLib.PDFPageProxy,
): Promise<PositionedWord[]> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();

  return content.items
    .filter(
      (item): item is pdfjsLib.TextItem =>
        "str" in item && item.str.trim().length > 0,
    )
    .map((item) => {
      const x = item.transform[4];
      const y = item.transform[5];
      // pdfjs y is measured from the BOTTOM of the page — flip so smaller = higher,
      // matching the "top" convention used throughout this parser.
      const top = viewport.height - y;
      return { text: item.str.trim(), x, top };
    });
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

    const nameColumnMaxX = Math.min(...anchors.map((a) => a.x)) - 20;

    for (const row of rows) {
      // Skip the header row itself
      if (row.some((w) => w.text === "Mon")) continue;

      const rawNameWords = row.filter((w) => w.x < nameColumnMaxX);

      // Drop stray single-character marker tokens (1, 2, 4, L, *) that sit in
      // the unlabeled marker column between Name and FMS — these aren't part
      // of anyone's actual name, they're coaching shorthand we're ignoring.
      const nameWords = rawNameWords.filter((w) => !/^[0-9A-Z*]$/.test(w.text));

      if (nameWords.length === 0) continue; // this "row" was just a lone marker

      const name = nameWords
        .map((w) => w.text)
        .join(" ")
        .replace(/,$/, "");
      const [last, first] = name.split(",").map((s) => s.trim());
      const displayName = first ? `${first} ${last}` : name;

      // Anything that still doesn't look like a real "First Last" name — skip it
      if (!first || displayName.length < 3) continue;

      const dataWords = row.filter((w) => w.x >= nameColumnMaxX);
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

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const words = await extractPageWords(page);

    const groupHeaderWord = words.find((w) => w.text === "G");
    if (!groupHeaderWord) continue; // not a roster/group page

    const groupColumnX = groupHeaderWord.x;
    const nameColumnMaxX = groupColumnX - 200; // names sit far left; dot-columns fill the middle
    const descriptionMinX = groupColumnX + 15; // description text sits just right of the letter

    const rows = clusterIntoRows(words);

    for (const row of rows) {
      const nameWords = row.filter((w) => w.x < nameColumnMaxX);
      const groupWord = row.find(
        (w) => Math.abs(w.x - groupColumnX) < 10 && /^[A-Z]{1,2}$/.test(w.text),
      );

      if (nameWords.length > 0 && groupWord) {
        const rawName = nameWords
          .map((w) => w.text)
          .join(" ")
          .replace(/,$/, "");
        const [last, first] = rawName.split(",").map((s) => s.trim());
        const displayName = first ? `${first} ${last}` : rawName;

        assignments.push({ name: displayName, groupLetter: groupWord.text });
      }
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
  }

  const groupDefinitions: WorkoutGroupDefinition[] = Array.from(
    definitionsByLetter.entries(),
  ).map(([groupLetter, description]) => ({ groupLetter, description }));

  return { assignments, groupDefinitions };
}
