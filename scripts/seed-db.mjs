/**
 * Seeds the SQLite database from shared/standards.json (the canonical catalog).
 * Safe to re-run: existing rows are updated in place, analyses and decisions are untouched.
 */
import { seedStandards, countStandards, SEED_PATH } from "../server/db.js";

try {
  const n = seedStandards();
  console.log(`Seeded ${n} standards from ${SEED_PATH}`);
  console.log(`Catalog now holds ${countStandards()} standards.`);
} catch (err) {
  console.error(`Seed failed: ${err.message}`);
  process.exit(1);
}
