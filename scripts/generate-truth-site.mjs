import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Build all CSV-driven data, routes, social links and compatibility behavior first.
await import("./generate-truth-release.mjs");

const truthPath = path.join(root, "data", "truth.generated.json");
const seedPath = path.join(root, "data", "portfolio-seed.json");
const truth = JSON.parse(await readFile(truthPath, "utf8"));
const seed = JSON.parse(await readFile(seedPath, "utf8"));

function normalizedSection(item) {
  return {
    ...item,
    header_size: Number(item.header_size) || null,
    subheader_size: Number(item.subheader_size) || null,
    body_size: Number(item.body_size) || null,
  };
}

// DESIGN mirrors PROPS as a two-row editorial overview. Existing CSV sections
// always win once the desktop editor has saved real page_section rows.
if (truth.pages?.design && seed.design) {
  if (!Array.isArray(truth.pages.design.sections) || truth.pages.design.sections.length === 0) {
    truth.pages.design.sections = (seed.design.sections || []).map(normalizedSection);
  }
}

// The complete generator creates the hidden project pages and their public
// routes. Seed their editorial rows only until truth.csv contains real rows.
for (const item of seed.hidden_pages || []) {
  const key = String(item.key || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  const page = truth.pages?.[key];
  if (!key || !page) continue;
  if (!Array.isArray(page.sections) || page.sections.length === 0) {
    page.sections = (item.sections || []).map(normalizedSection);
  }
}

// Twitter/X was intentionally removed. Even if an older truth.csv still has a
// stale row, only the two approved social profiles can reach the rendered site.
truth.site ||= {};
truth.site.socials = (truth.site.socials || []).filter((item) =>
  ["facebook", "instagram"].includes(String(item.platform || "").trim().toLowerCase()),
);

truth.schema_version = "1.12.1";
await writeFile(truthPath, `${JSON.stringify(truth, null, 2)}\n`, "utf8");
console.log("Applied DESIGN overview, hidden scenic project sections, and Facebook/Instagram-only social links.");
