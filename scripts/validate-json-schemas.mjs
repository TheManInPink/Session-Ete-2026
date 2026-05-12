#!/usr/bin/env node
/**
 * Validate key JSON data files against repository JSON schemas.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const checks = [
  {
    data: path.join(ROOT, "data", "mali", "regions.json"),
    schema: path.join(ROOT, "schemas", "mali-regions.schema.json"),
  },
  {
    data: path.join(ROOT, "data", "mali", "cercles.json"),
    schema: path.join(ROOT, "schemas", "mali-cercles.schema.json"),
  },
];

const ajv = new Ajv2020({ allErrors: true, strict: false });
let hasError = false;

for (const check of checks) {
  const dataName = path.relative(ROOT, check.data);
  const schemaName = path.relative(ROOT, check.schema);

  if (!fs.existsSync(check.data) || !fs.existsSync(check.schema)) {
    console.error(`❌ Missing file(s): ${dataName} or ${schemaName}`);
    hasError = true;
    continue;
  }

  const data = JSON.parse(fs.readFileSync(check.data, "utf8"));
  const schema = JSON.parse(fs.readFileSync(check.schema, "utf8"));
  const validate = ajv.compile(schema);

  const ok = validate(data);
  if (ok) {
    console.log(`✅ ${dataName} conforms to ${schemaName}`);
    continue;
  }

  hasError = true;
  console.error(`❌ ${dataName} does not conform to ${schemaName}`);
  for (const issue of validate.errors ?? []) {
    console.error(`   - ${issue.instancePath || "/"} ${issue.message ?? "invalid"}`);
  }
}

if (hasError) {
  process.exit(1);
}

console.log("✅ All schema checks passed.");
