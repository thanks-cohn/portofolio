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
const csvText = await readFile(path.join(root, "truth.csv"), "utf8");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ""; }
    else if (ch === '\n') { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  const [header, ...body] = rows.filter((item) => item.some((value) => value !== ""));
  if (!header) return [];
  return body.map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""])));
}

function normalizeFontInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  let href = "";
  const linkMatch = raw.match(/href\s*=\s*["'](https:\/\/fonts\.googleapis\.com\/[^"']+)["']/i);
  if (linkMatch) href = linkMatch[1].replace(/&amp;/g, "&");
  else {
    const urlMatch = raw.match(/https:\/\/fonts\.googleapis\.com\/[^\s"'<>]+/i);
    if (urlMatch) href = urlMatch[0].replace(/&amp;/g, "&");
  }
  if (!href) return null;
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" || url.hostname !== "fonts.googleapis.com") return null;
    const familySpecs = url.searchParams.getAll("family");
    const families = familySpecs
      .map((item) => item.split(":")[0].replace(/\+/g, " ").trim())
      .filter(Boolean);
    if (!families.length) return null;
    return { href, family: families[0], families, raw };
  } catch {
    return null;
  }
}

function decodePart(value) {
  try { return decodeURIComponent(value || ""); } catch { return value || ""; }
}

function parseFontTarget(value) {
  const parts = String(value || "").split("::");
  if (parts.length !== 5 || parts[0] !== "font") return null;
  const [, record, product, order, field] = parts.map(decodePart);
  if (!record || !field) return null;
  return { record, product, order, field };
}

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

  // CSV/Q edits own the visible image and text fields, but a missing click target
  // must never mean "delete the project link". The destination belongs to the
  // section wrapper, independently of whichever image URL is currently shown.
  for (const item of seedSections || []) {
    const order = Number(item?.order);
    if (!Number.isInteger(order) || order < 1) continue;
    const seeded = normalizedSection(item);
    const current = byOrder.get(order);
    if (!current) {
      byOrder.set(order, seeded);
      continue;
    }
    byOrder.set(order, normalizedSection({
      ...seeded,
      ...current,
      image_link_url: String(current.image_link_url || "").trim() || String(seeded.image_link_url || "").trim(),
    }));
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

// FONT and MULTI-FONT use ordinary page_text rows so the existing Q publisher
// can save them without a second backend. The row title encodes the exact
// data-q target; the description stores the complete copied Google Fonts input.
truth.q_fonts = parseCsv(csvText)
  .filter((row) => row.record_type === "page_text" && String(row.product_id || "").trim() === "q-fonts")
  .map((row) => {
    const target = parseFontTarget(row.title);
    const font = normalizeFontInput(row.description);
    return target && font ? { target, font } : null;
  })
  .filter(Boolean);

// Twitter/X was intentionally removed. Even if an older truth.csv still has a
// stale row, only the two approved social profiles can reach the rendered site.
truth.site ||= {};
truth.site.socials = (truth.site.socials || []).filter((item) =>
  ["facebook", "instagram"].includes(String(item.platform || "").trim().toLowerCase()),
);

truth.schema_version = "1.13.0";
await writeFile(truthPath, `${JSON.stringify(truth, null, 2)}\n`, "utf8");
console.log("Preserved project redirects and applied persistent Q font assignments.");
