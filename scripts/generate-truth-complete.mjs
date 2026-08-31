import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// First run the compatibility-safe generator that preserves the original NUME
// families and builds the normal Quandranea truth model.
await import("./generate-truth-safe.mjs");

const truthPath = path.join(root, "data", "truth.generated.json");
const truth = JSON.parse(await readFile(truthPath, "utf8"));
const csvText = await readFile(path.join(root, "truth.csv"), "utf8");
const seed = JSON.parse(await readFile(path.join(root, "data", "portfolio-seed.json"), "utf8"));

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

const rows = parseCsv(csvText);
const cleanKey = (value) => (value || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
const routeSlug = (value) => (value || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "_").replace(/^[_-]+|[_-]+$/g, "") || "page";
function normalizeRoute(value, fallback = "page") {
  let text = (value || "").trim();
  if (/^https?:\/\//i.test(text)) {
    try { text = new URL(text).pathname; } catch { text = ""; }
  }
  const segments = text.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean).map(routeSlug);
  if (!segments.length) segments.push(routeSlug(fallback));
  return `/${segments.join("/")}/`;
}
const truthy = (value) => ["1", "true", "yes", "on", "show"].includes((value || "").trim().toLowerCase());
const aliases = (value) => [...new Set((value || "").split(";").map((v) => v.trim()).filter(Boolean).map((v) => normalizeRoute(v)))];

function normalizeFontInput(value) {
  const raw = (value || "").trim();
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
    const familyValues = url.searchParams.getAll("family");
    const families = familyValues
      .map((item) => item.split(":")[0].replace(/\+/g, " ").trim())
      .filter(Boolean);
    if (!families.length) return null;
    return { href, family: families[0], families, raw };
  } catch {
    return null;
  }
}

// Per-visible-text font inputs. Context is site, a block product_id, or page key.
const fontInputs = { site: {}, blocks: {}, pages: {} };
for (const row of rows.filter((item) => item.record_type === "font_input")) {
  const context = (row.product_id || "").trim();
  const field = (row.title || "").trim();
  const font = normalizeFontInput(row.description);
  if (!context || !field || !font) continue;
  if (context === "site") fontInputs.site[field] = font;
  else if (context.startsWith("product_nume_objects_")) {
    fontInputs.blocks[context] ||= {};
    fontInputs.blocks[context][field] = font;
  } else {
    const pageKey = cleanKey(context);
    if (!pageKey) continue;
    fontInputs.pages[pageKey] ||= {};
    fontInputs.pages[pageKey][field] = font;
  }
}
truth.text_fonts = fontInputs;

// The visual page editor also accepts the full copied Google <link> block.
for (const row of rows.filter((item) => item.record_type === "page_style")) {
  const pageKey = cleanKey(row.product_id);
  const match = /^(title|kicker|body)_font_url$/.exec((row.title || "").trim());
  if (!pageKey || !match || !truth.pages?.[pageKey]?.style) continue;
  const font = normalizeFontInput(row.description);
  truth.pages[pageKey].style[match[1]].font_url = font?.href || "";
}
for (const row of rows.filter((item) => item.record_type === "page_section")) {
  const pageKey = cleanKey(row.product_id);
  const order = Number(row.order);
  const section = truth.pages?.[pageKey]?.sections?.find((item) => item.order === order);
  if (!section) continue;
  section.header_font_url = normalizeFontInput(row.destination_url)?.href || section.header_font_url || "";
  section.subheader_font_url = normalizeFontInput(row.footer_icon_label)?.href || section.subheader_font_url || "";
  section.body_font_url = normalizeFontInput(row.footer_icon_url)?.href || section.body_font_url || "";
}

// Seed the requested editorial structure without taking control away from truth.csv.
// Once the desktop editor saves real rows for these sections/pages, those rows win.
truth.pages ||= {};
truth.site ||= {};
truth.site.font_rules ||= [];

const headingFont = fontInputs.site.row_heading || normalizeFontInput(seed.landing?.row_heading_font || "");
if (headingFont) {
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

if (truth.pages.acting && seed.props) {
  truth.pages.acting.title = seed.props.title;
  truth.pages.acting.kicker = seed.props.kicker;
  truth.pages.acting.body = seed.props.body;
  if (!Array.isArray(truth.pages.acting.sections) || truth.pages.acting.sections.length === 0) {
    truth.pages.acting.sections = seed.props.sections.map((item) => ({
      ...item,
      header_size: Number(item.header_size) || null,
      subheader_size: Number(item.subheader_size) || null,
      body_size: Number(item.body_size) || null,
    }));
  }
}

if (truth.pages.contact && seed.contact_email) truth.pages.contact.email = seed.contact_email;

for (const item of seed.hidden_pages || []) {
  const key = cleanKey(item.key);
  if (!key || truth.pages[key]) continue;
  truth.pages[key] = {
    title: item.title,
    kicker: item.kicker,
    body: item.body,
    path: item.path,
    custom: true,
    style: {
      title: { tag: "h1", color: "", size: null, font_url: "" },
      kicker: { tag: "p", color: "", size: null, font_url: "" },
      body: { tag: "p", color: "", size: null, font_url: "" },
    },
    sections: [],
  };
}

// Correct obvious visible spelling issues while leaving the underlying project data intact.
for (const block of truth.blocks || []) {
  if (block.title === "Shakespears Twelfth Night" || block.title === "Shakespeare Twelfth Night") block.title = "Shakespeare's Twelfth Night";
  if (block.title === "Prop Artist ( The servant of Two masters)") block.title = "Prop Artist (The Servant of Two Masters)";
  if (block.description === "Carpentinng for Big love.") block.description = "Carpentry for Big Love.";
  if (block.description === "spring 2026") block.description = "Spring 2026";
}

const fixedPages = ["acting", "design", "resume", "contact"];
const fixedDefaults = Object.fromEntries(fixedPages.map((key) => [key, `/${key}/`]));
const routeRows = new Map();
for (const row of rows) {
  if (row.record_type === "page_route") routeRows.set(cleanKey(row.product_id), row);
  if (row.record_type === "page_meta") routeRows.set(cleanKey(row.product_id), row);
}

const descriptors = [];
for (const [pageKey, page] of Object.entries(truth.pages || {})) {
  if (!page || typeof page !== "object") continue;
  const routeRow = routeRows.get(pageKey);
  const isFixed = fixedPages.includes(pageKey);
  if (!isFixed && !page.custom && !routeRow) continue;
  const fallbackName = routeRow?.title || page.title || pageKey;
  const canonical = normalizeRoute(
    routeRow?.route_path || routeRow?.destination_url || page.path || fixedDefaults[pageKey] || `/${routeSlug(fallbackName)}/`,
    fallbackName,
  );
  const routeAliases = aliases(routeRow?.route_aliases || "");
  const legacy = fixedDefaults[pageKey];
  if (legacy && legacy !== canonical && !routeAliases.includes(legacy)) routeAliases.push(legacy);
  const show = routeRow ? truthy(routeRow.show_in_nav) : isFixed;
  const label = (routeRow?.nav_label || routeRow?.title || page.title || pageKey).trim();
  const order = Number(routeRow?.nav_order || (fixedPages.indexOf(pageKey) + 1) * 10 || 999);
  page.path = canonical;
  descriptors.push({ pageKey, canonical, aliases: routeAliases, show, label, order, fixed: isFixed });
}

// Build the top menu from the simple controls. HOME stays first and all visible
// titles are rendered in uppercase while preserving the actual words.
const firstBlock = rows.find((row) => !row.record_type || row.record_type === "block") || {};
const homeLabel = (firstBlock.nav_home_label || "HOME").trim().toUpperCase();
const pageNav = descriptors
  .filter((item) => item.show)
  .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
  .map((item) => ({
    label: item.label.toUpperCase(),
    url: item.canonical,
    page_key: item.pageKey,
    font: fontInputs.pages[item.pageKey]?.nav_label || null,
  }));
truth.site.header_nav = [
  { label: homeLabel, url: firstBlock.nav_home_url || "/", page_key: "home", font: fontInputs.site.nav_home_label || null },
  ...pageNav,
];

// Remove the /pages/<key> compatibility routes made by the earlier layer.
await rm(path.join(root, "app", "pages"), { recursive: true, force: true });

const reserved = new Map([
  ["/acting/", "acting"], ["/design/", "design"], ["/resume/", "resume"], ["/contact/", "contact"],
]);
const generated = new Map();

function relativeImport(fromDir, targetNoExt) {
  let rel = path.relative(fromDir, targetNoExt).replaceAll(path.sep, "/");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel;
}

async function generateRoute(route, pageKey) {
  const normalized = normalizeRoute(route, pageKey);
  const reservedOwner = reserved.get(normalized);
  if (reservedOwner) {
    if (reservedOwner !== pageKey) throw new Error(`Route ${normalized} belongs to ${reservedOwner} and cannot also point to ${pageKey}.`);
    return;
  }
  const prior = generated.get(normalized);
  if (prior && prior !== pageKey) throw new Error(`Route ${normalized} is assigned to both ${prior} and ${pageKey}.`);
  generated.set(normalized, pageKey);
  const segments = normalized.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (!segments.length) throw new Error("Custom page route cannot replace the site root.");
  const dir = path.join(root, "app", ...segments);
  await mkdir(dir, { recursive: true });
  if (pageKey === "resume") {
    const target = path.join(root, "app", "resume", "resume-experience");
    const imp = relativeImport(dir, target);
    await writeFile(path.join(dir, "page.tsx"), `import { ResumeExperience } from ${JSON.stringify(imp)};\n\nexport default function RoutedResumePage() {\n  return <ResumeExperience />;\n}\n`, "utf8");
  } else {
    const target = path.join(root, "app", "portfolio-section");
    const imp = relativeImport(dir, target);
    await writeFile(path.join(dir, "page.tsx"), `import { PortfolioSection } from ${JSON.stringify(imp)};\n\nexport default function RoutedContentPage() {\n  return <PortfolioSection section=${JSON.stringify(pageKey)} />;\n}\n`, "utf8");
  }
}

for (const item of descriptors) {
  await generateRoute(item.canonical, item.pageKey);
  for (const alias of item.aliases) await generateRoute(alias, item.pageKey);
}

truth.schema_version = "1.9.1";
await writeFile(truthPath, `${JSON.stringify(truth, null, 2)}\n`, "utf8");
console.log(`Applied ${descriptors.length} editable page route(s), PROPS defaults, hidden project pages, and per-text Google Fonts.`);
