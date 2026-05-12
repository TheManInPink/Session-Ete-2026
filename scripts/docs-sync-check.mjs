#!/usr/bin/env node
/**
 * Basic cross-reference sync checks for core docs.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const requiredRefs = [
  // Lien README → docs canoniques
  { file: "README.md", mustContain: "docs/00-README-INDEX.md" },
  { file: "README.md", mustContain: "docs/CHANGELOG.md" },

  // Index README → CHANGELOG (référencement obligatoire)
  { file: "docs/00-README-INDEX.md", mustContain: "CHANGELOG.md" },

  // CHANGELOG : section de gouvernance IA présente
  { file: "docs/CHANGELOG.md", mustContain: "## 8. Gouvernance assistants IA" },

  // MAINTENANCE.md : présent et référencé par les 4 fichiers de gouvernance IA
  { file: "MAINTENANCE.md", mustContain: "verify:repo" },
  { file: "AGENTS.md", mustContain: "MAINTENANCE.md" },
  { file: "CLAUDE.md", mustContain: "MAINTENANCE.md" },
  { file: ".github/copilot-instructions.md", mustContain: "MAINTENANCE.md" },
  { file: ".cursor/rules/ai-governance.mdc", mustContain: "MAINTENANCE.md" },
];

let hasError = false;

for (const ref of requiredRefs) {
  const fullPath = path.join(ROOT, ref.file);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Missing file: ${ref.file}`);
    hasError = true;
    continue;
  }

  const content = fs.readFileSync(fullPath, "utf8");
  if (!content.includes(ref.mustContain)) {
    console.error(`❌ ${ref.file} missing reference: "${ref.mustContain}"`);
    hasError = true;
    continue;
  }

  console.log(`✅ ${ref.file} contains "${ref.mustContain}"`);
}

if (hasError) {
  process.exit(1);
}

console.log("✅ Documentation sync checks passed.");
