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

function mergeSeedSections(page, seedSections) {
  if (!page) return;
  const existing = Array.isArray(page.sections) ? page.sections : [];
  const byOrder = new Map(
    existing
      .filter((item) => Number.isInteger(Number(item?.order)) && Number(item.order) > 0)
      .map((item) => [Number(item.order), item]),
  );

  // A CSV-edited row always wins. Seed data only fills orders that are absent.
  // This is important for the floating-Q editor: changing one image/text field
  // must never make the untouched sibling rows disappear after redeployment.
  for (const item of seedSections || []) {
    const order = Number(item?.order);
    if (!Number.isInteger(order) || order < 1 || byOrder.has(order)) continue;
    byOrder.set(order, normalizedSection(item));
  }

  page.sections = [...byOrder.values()].sort((a, b) => Number(a.order) - Number(b.order));
}

// PROPS and DESIGN are editorial overview pages. Preserve every untouched seed
// row while allowing any individual CSV/Q edit to override its matching order.
if (truth.pages?.acting && seed.props) {
  mergeSeedSections(truth.pages.acting, seed.props.sections || []);
}
if (truth.pages?.design && seed.design) {
  mergeSeedSections(truth.pages.design, seed.design.sections || []);
}

// Hidden project pages work the same way: one edited row must not collapse the
// other three seeded rows. Existing CSV rows win order-by-order.
for (const item of seed.hidden_pages || []) {
  const key = String(item.key || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  const page = truth.pages?.[key];
  if (!key || !page) continue;
  mergeSeedSections(page, item.sections || []);
}

// Twitter/X was intentionally removed. Even if an older truth.csv still has a
// stale row, only the two approved social profiles can reach the rendered site.
truth.site ||= {};
truth.site.socials = (truth.site.socials || []).filter((item) =>
  ["facebook", "instagram"].includes(String(item.platform || "").trim().toLowerCase()),
);

truth.schema_version = "1.12.2";
await writeFile(truthPath, `${JSON.stringify(truth, null, 2)}\n`, "utf8");
console.log("Preserved untouched PROPS, DESIGN, and project rows while applying CSV edits.");
