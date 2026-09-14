#!/usr/bin/env node
/**
 * repo-digest.mjs
 *
 * Walks the current repo and writes a single markdown file (repo-digest.md)
 * containing:
 *   1. A directory tree
 *   2. The full contents of every text/source file, clearly delimited
 *
 * This format is designed to be pasted into or fed to an LLM/agent so it can
 * understand the whole project structure and code in one shot.
 *
 * Usage:
 *   node repo-digest.mjs
 *   node repo-digest.mjs --root ./my-project --out ./digest.md
 */

import fs from "node:fs";
import path from "node:path";

// ---------- CONFIG ----------

// Directories to skip entirely (build artifacts, deps, vcs internals, etc.)
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".vite",
  "coverage",
  ".turbo",
  ".vscode",
  ".idea",
]);

// File extensions considered "binary" / not useful to dump as text.
// Their presence is still noted in the tree, just not inlined.
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".svg",
  ".mp3",
  ".wav",
  ".ogg",
  ".mp4",
  ".mov",
  ".webm",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".pdf",
  ".zip",
  ".gz",
  ".lock",
  ".json", // package-lock.json is text but huge/noisy; still skip contents
]);

// Specific filenames to skip contents for (still shown in tree)
const SKIP_CONTENT_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "repo-digest.md",
]);

// Max file size (bytes) to inline before truncating
const MAX_FILE_BYTES = 100_000;

// ---------- ARG PARSING ----------

function parseArgs(argv) {
  const args = { root: ".", out: "repo-digest.md" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root") args.root = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
  }
  return args;
}

const { root, out } = parseArgs(process.argv.slice(2));
const ROOT = path.resolve(root);
const OUT_PATH = path.resolve(out);

// ---------- .gitignore (basic support) ----------

function loadGitignorePatterns(rootDir) {
  const gitignorePath = path.join(rootDir, ".gitignore");
  if (!fs.existsSync(gitignorePath)) return [];
  return fs
    .readFileSync(gitignorePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.replace(/\/$/, "")); // strip trailing slash
}

const gitignorePatterns = loadGitignorePatterns(ROOT);

function isGitignored(relativePath) {
  const base = path.basename(relativePath);
  return gitignorePatterns.some((pattern) => {
    // very basic matching: exact name, or simple * wildcard
    if (pattern === base || pattern === relativePath) return true;
    if (pattern.includes("*")) {
      const regex = new RegExp(
        "^" +
          pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") +
          "$",
      );
      return regex.test(base) || regex.test(relativePath);
    }
    return false;
  });
}

// ---------- WALK ----------

function walk(dir, relativeTo) {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => {
    // directories first, then alphabetical
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const nodes = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path
      .relative(relativeTo, fullPath)
      .split(path.sep)
      .join("/");

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      if (isGitignored(relPath)) continue;
      const children = walk(fullPath, relativeTo);
      nodes.push({ type: "dir", name: entry.name, relPath, children });
    } else {
      if (isGitignored(relPath)) continue;
      nodes.push({ type: "file", name: entry.name, relPath, fullPath });
    }
  }
  return nodes;
}

// ---------- RENDER TREE ----------

function renderTree(nodes, prefix = "") {
  let output = "";
  nodes.forEach((node, index) => {
    const isLast = index === nodes.length - 1;
    const connector = isLast ? "└── " : "├── ";
    output +=
      prefix + connector + node.name + (node.type === "dir" ? "/" : "") + "\n";
    if (node.type === "dir") {
      const childPrefix = prefix + (isLast ? "    " : "│   ");
      output += renderTree(node.children, childPrefix);
    }
  });
  return output;
}

// ---------- COLLECT FILES (flat list, in tree order) ----------

function collectFiles(nodes, list = []) {
  for (const node of nodes) {
    if (node.type === "file") list.push(node);
    else collectFiles(node.children, list);
  }
  return list;
}

function langFromExt(ext) {
  const map = {
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".jsx": "jsx",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".css": "css",
    ".scss": "scss",
    ".html": "html",
    ".json": "json",
    ".md": "markdown",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".py": "python",
    ".sh": "bash",
    ".ps1": "powershell",
  };
  return map[ext] || "";
}

// ---------- MAIN ----------

function main() {
  if (!fs.existsSync(ROOT)) {
    console.error(`Root path does not exist: ${ROOT}`);
    process.exit(1);
  }

  const tree = walk(ROOT, ROOT);
  const treeText = renderTree(tree);
  const files = collectFiles(tree);

  const sections = [];
  sections.push(`# Repository Digest\n`);
  sections.push(`Generated: ${new Date().toISOString()}`);
  sections.push(`Root: \`${path.basename(ROOT)}\`\n`);
  sections.push(`## Directory Structure\n`);
  sections.push("```\n" + path.basename(ROOT) + "/\n" + treeText + "```\n");
  sections.push(`## File Contents\n`);

  let includedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    const ext = path.extname(file.name).toLowerCase();

    if (BINARY_EXTENSIONS.has(ext) || SKIP_CONTENT_FILES.has(file.name)) {
      sections.push(
        `### \`${file.relPath}\`\n\n_(binary or excluded — contents not inlined)_\n`,
      );
      skippedCount++;
      continue;
    }

    let content;
    try {
      const stat = fs.statSync(file.fullPath);
      if (stat.size > MAX_FILE_BYTES) {
        content = fs
          .readFileSync(file.fullPath, "utf8")
          .slice(0, MAX_FILE_BYTES);
        content += `\n\n... [truncated, file is ${stat.size} bytes, showing first ${MAX_FILE_BYTES}] ...`;
      } else {
        content = fs.readFileSync(file.fullPath, "utf8");
      }
    } catch (err) {
      sections.push(
        `### \`${file.relPath}\`\n\n_(could not read file: ${err.message})_\n`,
      );
      skippedCount++;
      continue;
    }

    const lang = langFromExt(ext);
    sections.push(
      `### \`${file.relPath}\`\n\n\`\`\`${lang}\n${content}\n\`\`\`\n`,
    );
    includedCount++;
  }

  sections.push(
    `\n---\n_Digest complete: ${includedCount} files inlined, ${skippedCount} skipped (binary/excluded)._`,
  );

  fs.writeFileSync(OUT_PATH, sections.join("\n"), "utf8");
  console.log(`✅ Wrote digest to ${OUT_PATH}`);
  console.log(`   Files inlined: ${includedCount}`);
  console.log(`   Files skipped: ${skippedCount}`);
}

main();
