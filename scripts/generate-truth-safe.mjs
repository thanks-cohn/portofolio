import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPaths = [
  "data/catalogs/nume-marketplace.v1.json",
  "data/catalog-sync/published-marketplace.v1.json",
];
const load = async (p) => JSON.parse(await readFile(path.join(root, p), "utf8"));
const write = async (p, value) => writeFile(path.join(root, p), `${JSON.stringify(value, null, 2)}\n`);

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
  const [header, ...body] = rows.filter((r) => r.some((v) => v !== ""));
  if (!header) return [];
  return body.map((values) => Object.fromEntries(header.map((key, i) => [key, values[i] ?? ""])));
}

const validTags = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6"]);
const cleanTag = (value, fallback) => validTags.has((value || "").trim().toLowerCase()) ? value.trim().toLowerCase() : fallback;
const cleanColor = (value) => /^#[0-9a-fA-F]{3,8}$/.test((value || "").trim()) ? value.trim() : "";
const cleanSize = (value) => {
  const size = Number((value || "").trim());
  return Number.isFinite(size) && size >= 8 && size <= 160 ? size : null;
};
const cleanFontUrl = (value) => {
  const text = (value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.protocol === "https:" && url.hostname === "fonts.googleapis.com" ? text : "";
  } catch {
    return "";
  }
};

// Snapshot everything outside the one CSV-controlled Quandranea object family.
const preserved = new Map();
for (const catalogPath of catalogPaths) {
  const catalog = await load(catalogPath);
  preserved.set(
    catalogPath,
    catalog.products.filter((product) => !product.product_id.startsWith("product_nume_objects_")),
  );
}

// The normal generator owns truth JSON, layouts, and the Quandranea object family.
await import("./generate-truth.mjs");

// The visual editor stores optional presentation metadata as independent CSV
// rows/columns. Post-process the generated truth so the original generator stays
// backward-compatible with old CSV files.
const csvRows = parseCsv(await readFile(path.join(root, "truth.csv"), "utf8"));
const truthPath = "data/truth.generated.json";
const truth = await load(truthPath);

const styleDefaults = {
  title: { tag: "h1", color: "", size: null, font_url: "" },
  kicker: { tag: "p", color: "", size: null, font_url: "" },
  body: { tag: "p", color: "", size: null, font_url: "" },
};

for (const pageKey of ["acting", "design", "contact"]) {
  if (truth.pages?.[pageKey]) truth.pages[pageKey].style = structuredClone(styleDefaults);
}

for (const row of csvRows.filter((item) => item.record_type === "page_style")) {
  const pageKey = (row.product_id || "").trim().toLowerCase();
  if (!truth.pages?.[pageKey]?.style) continue;
  const match = /^(title|kicker|body)_(tag|color|size|font_url)$/.exec((row.title || "").trim());
  if (!match) continue;
  const [, target, property] = match;
  const value = row.description || "";
  if (property === "tag") truth.pages[pageKey].style[target].tag = cleanTag(value, styleDefaults[target].tag);
  else if (property === "color") truth.pages[pageKey].style[target].color = cleanColor(value);
  else if (property === "size") truth.pages[pageKey].style[target].size = cleanSize(value);
  else if (property === "font_url") truth.pages[pageKey].style[target].font_url = cleanFontUrl(value);
}

for (const row of csvRows.filter((item) => item.record_type === "page_section")) {
  const pageKey = (row.product_id || "").trim().toLowerCase();
  const order = Number(row.order);
  const section = truth.pages?.[pageKey]?.sections?.find((item) => item.order === order);
  if (!section) continue;
  section.header_size = cleanSize(row.header_size);
  section.subheader_size = cleanSize(row.subheader_size);
  section.body_size = cleanSize(row.body_size);
}

truth.schema_version = "1.5.0";
await write(truthPath, truth);

// Put all unrelated original catalog families back exactly as they were.
for (const catalogPath of catalogPaths) {
  const generated = await load(catalogPath);
  const objectProducts = generated.products.filter((product) => product.product_id.startsWith("product_nume_objects_"));
  generated.products = [...preserved.get(catalogPath), ...objectProducts];
  await write(catalogPath, generated);
}

console.log("Preserved all non-Quandranea NUME catalog product families and applied visual page styles.");
