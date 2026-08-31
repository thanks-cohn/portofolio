import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

function csvText(rows, header) {
  const escape = (value) => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `${header.map(escape).join(",")}\n${rows.map((row) => header.map((key) => escape(row[key])).join(",")).join("\n")}\n`;
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
const cleanSlug = (value) => (value || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");

const truthCsvPath = path.join(root, "truth.csv");
const originalTruthText = await readFile(truthCsvPath, "utf8");
const csvRows = parseCsv(originalTruthText);
const header = csvRows.length ? Object.keys(csvRows[0]) : [];
const customMetaRows = csvRows.filter((item) => item.record_type === "page_meta");
const customKeys = new Set(customMetaRows.map((row) => cleanSlug(row.product_id)).filter(Boolean));

// Snapshot everything outside the one CSV-controlled Quandranea object family.
const preserved = new Map();
for (const catalogPath of catalogPaths) {
  const catalog = await load(catalogPath);
  preserved.set(
    catalogPath,
    catalog.products.filter((product) => !product.product_id.startsWith("product_nume_objects_")),
  );
}

// The original generator knows the fixed historical pages. Temporarily hide
// custom-page rows from it, then restore truth.csv immediately and add the
// portable custom pages in this compatibility layer.
if (customKeys.size && header.length) {
  const fixedRows = csvRows.filter((row) => {
    const type = row.record_type || "";
    const key = cleanSlug(row.product_id);
    if (type === "page_meta") return false;
    return !(["page_text", "page_style", "page_section"].includes(type) && customKeys.has(key));
  });
  await writeFile(truthCsvPath, csvText(fixedRows, header), "utf8");
}

try {
  await import("./generate-truth.mjs");
} finally {
  if (customKeys.size) await writeFile(truthCsvPath, originalTruthText, "utf8");
}

const truthPath = "data/truth.generated.json";
const truth = await load(truthPath);
const styleDefaults = {
  title: { tag: "h1", color: "", size: null, font_url: "" },
  kicker: { tag: "p", color: "", size: null, font_url: "" },
  body: { tag: "p", color: "", size: null, font_url: "" },
};

const pageTextRows = csvRows.filter((item) => item.record_type === "page_text");
const sectionRows = csvRows.filter((item) => item.record_type === "page_section");

for (const meta of customMetaRows) {
  const pageKey = cleanSlug(meta.product_id);
  if (!pageKey) continue;
  const textRows = pageTextRows.filter((row) => cleanSlug(row.product_id) === pageKey);
  const value = (field, fallback) => textRows.find((row) => (row.title || "").trim() === field)?.description ?? fallback;
  const page = {
    title: value("title", meta.title || "New Page"),
    kicker: value("kicker", ""),
    body: value("body", ""),
    path: (meta.destination_url || `/pages/${pageKey}/`).trim() || `/pages/${pageKey}/`,
    custom: true,
    style: structuredClone(styleDefaults),
    sections: [],
  };

  for (const row of sectionRows.filter((item) => cleanSlug(item.product_id) === pageKey)) {
    const order = Number(row.order);
    if (!Number.isInteger(order) || order < 1) continue;
    page.sections.push({
      order,
      image_side: ["left", "right"].includes((row.availability || "").toLowerCase()) ? row.availability.toLowerCase() : (order % 2 ? "left" : "right"),
      image_url: row.image_url || "",
      image_alt: row.image_alt || "",
      header: row.title || "",
      subheader: row.destination_label || "",
      body: row.description || "",
      header_tag: cleanTag(row.font_scope, "h2"),
      subheader_tag: cleanTag(row.font_product_id, "h3"),
      body_tag: cleanTag(row.color_scope, "p"),
      header_color: cleanColor(row.text_color),
      subheader_color: cleanColor(row.color_product_id),
      body_color: cleanColor(row.footer_icon_ref),
      header_font_url: cleanFontUrl(row.destination_url),
      subheader_font_url: cleanFontUrl(row.footer_icon_label),
      body_font_url: cleanFontUrl(row.footer_icon_url),
      header_size: cleanSize(row.header_size),
      subheader_size: cleanSize(row.subheader_size),
      body_size: cleanSize(row.body_size),
    });
  }
  page.sections.sort((a, b) => a.order - b.order);
  truth.pages[pageKey] = page;
}

// Add style objects to every ordinary content page, including new custom pages.
for (const [pageKey, page] of Object.entries(truth.pages || {})) {
  if (pageKey === "resume" || !("title" in page) || !("body" in page)) continue;
  page.style = page.style || structuredClone(styleDefaults);
}

for (const row of csvRows.filter((item) => item.record_type === "page_style")) {
  const pageKey = cleanSlug(row.product_id);
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

for (const row of sectionRows) {
  const pageKey = cleanSlug(row.product_id);
  const order = Number(row.order);
  const section = truth.pages?.[pageKey]?.sections?.find((item) => item.order === order);
  if (!section) continue;
  section.header_size = cleanSize(row.header_size);
  section.subheader_size = cleanSize(row.subheader_size);
  section.body_size = cleanSize(row.body_size);
}

// Make blocks topic-agnostic in truth data. Legacy price/status fields remain
// only as catalog compatibility plumbing and are not part of the content model.
for (const block of truth.blocks || []) {
  const source = csvRows.find((row) => (row.product_id || "").trim() === block.product_id);
  block.section = (source?.content_section || "").trim();
  block.location = (source?.content_location || "").trim();
  block.orientation = (source?.orientation || "auto").trim() || "auto";
}

truth.schema_version = "1.6.0";
await write(truthPath, truth);

// Generate literal static page routes. Because the site uses output: export on
// GitHub Pages, concrete folders are simpler and more reliable than a dynamic
// [slug] route. The same /pages/<slug>/ path works on Cloudflare Pages.
const generatedPagesRoot = path.join(root, "app", "pages");
await rm(generatedPagesRoot, { recursive: true, force: true });
await mkdir(generatedPagesRoot, { recursive: true });
for (const pageKey of [...customKeys].sort()) {
  const pageDirectory = path.join(generatedPagesRoot, pageKey);
  await mkdir(pageDirectory, { recursive: true });
  const source = `import { PortfolioSection } from "../../portfolio-section";\n\nexport default function GeneratedContentPage() {\n  return <PortfolioSection section=${JSON.stringify(pageKey)} />;\n}\n`;
  await writeFile(path.join(pageDirectory, "page.tsx"), source, "utf8");
}

// Put all unrelated original catalog families back exactly as they were.
for (const catalogPath of catalogPaths) {
  const generated = await load(catalogPath);
  const objectProducts = generated.products.filter((product) => product.product_id.startsWith("product_nume_objects_"));
  generated.products = [...preserved.get(catalogPath), ...objectProducts];
  await write(catalogPath, generated);
}

console.log(`Preserved unrelated NUME catalog families, applied visual styles, and generated ${customKeys.size} portable custom page(s).`);
