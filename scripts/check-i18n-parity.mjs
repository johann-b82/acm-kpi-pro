#!/usr/bin/env node
/**
 * CI check: de.json and en.json must have identical flattened key sets.
 * Fails with exit code 1 if sets diverge (TEST-04, I18N-03).
 *
 * Usage:
 *   node scripts/check-i18n-parity.mjs
 *
 * Integrated into the lint step via package.json:
 *   "lint": "biome check . && node scripts/check-i18n-parity.mjs"
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.resolve(__dirname, "../apps/frontend/src/locales");

function flattenKeys(obj, prefix = "") {
  return Object.entries(obj).flatMap(([key, val]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    return val !== null && typeof val === "object" && !Array.isArray(val)
      ? flattenKeys(val, fullKey)
      : [fullKey];
  });
}

const de = JSON.parse(fs.readFileSync(path.join(localesDir, "de.json"), "utf-8"));
const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf-8"));

const deKeys = flattenKeys(de).sort();
const enKeys = flattenKeys(en).sort();

const onlyInDe = deKeys.filter((k) => !enKeys.includes(k));
const onlyInEn = enKeys.filter((k) => !deKeys.includes(k));

if (onlyInDe.length > 0 || onlyInEn.length > 0) {
  if (onlyInDe.length > 0) {
    console.error("Keys in de.json but NOT in en.json:");
    onlyInDe.forEach((k) => console.error(`  - ${k}`));
  }
  if (onlyInEn.length > 0) {
    console.error("Keys in en.json but NOT in de.json:");
    onlyInEn.forEach((k) => console.error(`  - ${k}`));
  }
  console.error("\nERROR: i18n key mismatch between de.json and en.json");
  process.exit(1);
}

console.log(`i18n keys match (${deKeys.length} keys)`);
