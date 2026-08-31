import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Run the full route/font-aware generator first.
await import("./generate-truth-complete.mjs");

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
  const [header, ...body] = rows.filter((r) => r.some((value) => value !== ""));
  if (!header) return [];
  return body.map((values) => Object.fromEntries(header.map((key, i) => [key, values[i] ?? ""])));
}

const cleanKey = (value) => (value || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
const truthPath = path.join(root, "data", "truth.generated.json");
const truth = JSON.parse(await readFile(truthPath, "utf8"));
const csvRows = parseCsv(await readFile(path.join(root, "truth.csv"), "utf8"));
const seed = JSON.parse(await readFile(path.join(root, "data", "portfolio-seed.json"), "utf8"));
const first = csvRows.find((row) => !row.record_type || row.record_type === "block") || {};

function seededSection(item) {
  return {
    order: Number(item.order) || 1,
    image_side: item.image_side === "right" ? "right" : "left",
    image_url: item.image_url || "",
    image_alt: item.image_alt || "Project image",
    image_link_url: item.image_link_url || "",
    header: item.header || "",
    subheader: item.subheader || "",
    body: item.body || "",
    header_tag: item.header_tag || "h1",
    subheader_tag: item.subheader_tag || "h3",
    body_tag: item.body_tag || "p",
    header_color: item.header_color || "#f1eee7",
    subheader_color: item.subheader_color || "#b4b2ad",
    body_color: item.body_color || "#b4b2ad",
    header_font_url: item.header_font_url || "https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,500&display=swap",
    subheader_font_url: item.subheader_font_url || "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500&display=swap",
    body_font_url: item.body_font_url || "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400&display=swap",
    header_size: Number(item.header_size) || 52,
    subheader_size: Number(item.subheader_size) || 17,
    body_size: Number(item.body_size) || 16,
  };
}

// Each editorial image/text section may lead to a deeper page. That destination
// can be a page hidden from the top navigation; routing and menu visibility are
// deliberately independent concepts.
for (const row of csvRows.filter((item) => item.record_type === "page_section")) {
  const pageKey = cleanKey(row.product_id);
  const order = Number(row.order);
  if (!pageKey || !Number.isInteger(order)) continue;
  const section = truth.pages?.[pageKey]?.sections?.find((item) => item.order === order);
  if (!section) continue;
  section.image_link_url = (row.section_link_url || "").trim();
}

// The two initial hidden project pages get full editorial layouts. Real CSV
// page_section rows always win once the user edits those pages in the CMS.
for (const item of seed.hidden_pages || []) {
  const key = cleanKey(item.key);
  const page = truth.pages?.[key];
  if (!key || !page) continue;
  const csvSections = csvRows.filter((row) => row.record_type === "page_section" && cleanKey(row.product_id) === key);
  if (!csvSections.length && Array.isArray(item.sections)) page.sections = item.sections.map(seededSection);
}

// The requested public links keep their literal hyphens. The older route layer
// normalizes them to underscores, so generate explicit static aliases here.
for (const [routeName, pageKey] of [["project-a", "project-a"], ["project-b", "project-b"]]) {
  if (!truth.pages?.[pageKey]) continue;
  const dir = path.join(root, "app", routeName);
  await mkdir(dir, { recursive: true });
  const importPath = path.relative(dir, path.join(root, "app", "portfolio-section")).replaceAll(path.sep, "/");
  const rel = importPath.startsWith(".") ? importPath : `./${importPath}`;
  await writeFile(
    path.join(dir, "page.tsx"),
    `import { PortfolioSection } from ${JSON.stringify(rel)};\n\nexport default function ProjectPage() {\n  return <PortfolioSection section=${JSON.stringify(pageKey)} />;\n}\n`,
    "utf8",
  );
}

// Social profile URLs come from truth.csv. Seed values are only placeholders
// until the editor/user saves real social_link rows.
const socialRows = csvRows.filter((item) => item.record_type === "social_link");
const sourceSocials = socialRows.length
  ? socialRows.map((row) => ({
      platform: cleanKey(row.product_id),
      label: (row.title || row.product_id || "Social").trim(),
      url: (row.destination_url || "").trim(),
    }))
  : (seed.socials || []);
truth.site ||= {};
truth.site.socials = sourceSocials
  .filter((item) => ["facebook", "instagram", "twitter"].includes(cleanKey(item.platform)) && item.url)
  .map((item) => ({ platform: cleanKey(item.platform), label: item.label, url: item.url }));

const homeLabel = (first.nav_home_label || "HOME").trim();
const fixedKeys = new Set(["acting", "design", "resume", "contact"]);
const fixedItems = (truth.site?.header_nav || []).filter((item) => fixedKeys.has(item.page_key));
const accidentalAllHome = fixedItems.length >= 2 && homeLabel && fixedItems.every(
  (item) => String(item.label || "").trim().toLowerCase() === homeLabel.toLowerCase(),
);

if (accidentalAllHome) {
  const legacyLabels = {
    acting: (first.nav_acting_label || "ACTING").trim(),
    design: (first.nav_design_label || "DESIGN").trim(),
    resume: (first.nav_resume_label || "RESUME").trim(),
    contact: (first.nav_contact_label || "CONTACT").trim(),
  };
  for (const item of fixedItems) {
    if (legacyLabels[item.page_key]) item.label = legacyLabels[item.page_key];
  }
  console.log("Repaired accidental duplicated HOME labels on the fixed top-navigation pages.");
}

// Page copy follows the requested punctuation style. Replace em dashes with a
// simple spaced hyphen while leaving URLs, routes, and non-page data alone.
function cleanPageCopy(value) {
  if (typeof value === "string") return value.replace(/\s*—\s*/g, " - ");
  if (Array.isArray(value)) return value.map(cleanPageCopy);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cleanPageCopy(item)]));
  }
  return value;
}
truth.pages = cleanPageCopy(truth.pages || {});

// A font pasted into the desktop editor must override the seeded landing default.
const headingFont = truth.text_fonts?.site?.row_heading;
if (headingFont?.family) {
  truth.site ||= {};
  truth.site.font_rules ||= [];
  let rule = truth.site.font_rules.find((item) => item.scope === "row_heading" && !item.product_id);
  if (!rule) {
    rule = { scope: "row_heading", family: headingFont.family, weight: "500", style: "normal", fallback: "Georgia, serif" };
    truth.site.font_rules.push(rule);
  } else {
    rule.family = headingFont.family;
    rule.weight = "500";
    rule.style = "normal";
    rule.fallback = "Georgia, serif";
  }
}

// Top-menu display is always uppercase, but the words and editable labels remain intact.
for (const item of truth.site?.header_nav || []) {
  item.label = String(item.label || "").toUpperCase();
}

truth.schema_version = "1.12.0";
await writeFile(truthPath, `${JSON.stringify(truth, null, 2)}\n`, "utf8");
console.log("Applied full project layouts, click-through destinations, social links, uppercase navigation, and landing-font support.");
